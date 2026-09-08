use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;

use super::{
    RecoveryCodeDigest, RecoveryCodeRepository, RecoveryCodeSet, TOTP_MATCH_WINDOW_COUNTERS,
    TOTP_MAX_CLOCK_ROLLBACK_COUNTERS, TotpReplayRepository,
};

pub const RECOVERY_CODES_FILE: &str = "recovery-codes.json";
pub const TOTP_REPLAY_FILE: &str = "totp-replay.json";
const RECOVERY_LOCK_FILE: &str = "recovery-codes.lock";
const TOTP_REPLAY_LOCK_FILE: &str = "totp-replay.lock";
const MAX_STATE_BYTES: u64 = 64 * 1024;
const DIRECTORY_MODE: u32 = 0o700;
const FILE_MODE: u32 = 0o600;
const STATE_VERSION: u32 = 1;
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug)]
pub enum PersistenceError {
    Io(std::io::Error),
    InvalidData,
    InsecureDirectory,
    InsecureFile,
    WrongOwner,
    SymlinkRejected,
    AlreadyInitialized,
    CounterOutsideWindow,
    ClockRollback,
}

impl std::fmt::Display for PersistenceError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Io(_) => "authentication state I/O failed",
            Self::InvalidData => "authentication state is invalid",
            Self::InsecureDirectory => "authentication state directory permissions are invalid",
            Self::InsecureFile => "authentication state file permissions are invalid",
            Self::WrongOwner => "authentication state owner is invalid",
            Self::SymlinkRejected => "authentication state symlink rejected",
            Self::AlreadyInitialized => "authentication state already initialized",
            Self::CounterOutsideWindow => "TOTP replay counter is outside the accepted window",
            Self::ClockRollback => "TOTP clock moved behind the persisted replay high-water mark",
        })
    }
}

impl std::error::Error for PersistenceError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<std::io::Error> for PersistenceError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

#[derive(Debug, Clone)]
pub struct FilesystemRecoveryCodeRepository {
    directory: PathBuf,
}

impl FilesystemRecoveryCodeRepository {
    pub fn initialize(directory: &Path, codes: &RecoveryCodeSet) -> Result<Self, PersistenceError> {
        prepare_secure_directory(directory)?;
        let target = directory.join(RECOVERY_CODES_FILE);
        let lock = open_secure_lock(&directory.join(RECOVERY_LOCK_FILE))?;
        FileExt::lock_exclusive(&lock)?;
        if fs::symlink_metadata(&target).is_ok() {
            return Err(PersistenceError::AlreadyInitialized);
        }
        let state = RecoveryState::from_set(codes);
        atomic_write_json(directory, &target, &state)?;
        Self::open(directory)
    }

    pub fn open(directory: &Path) -> Result<Self, PersistenceError> {
        validate_secure_directory(directory)?;
        let target = directory.join(RECOVERY_CODES_FILE);
        validate_secure_file(&target)?;
        read_recovery_state(&target)?;
        Ok(Self {
            directory: directory.to_owned(),
        })
    }

    pub fn replace(&self, codes: &RecoveryCodeSet) -> Result<(), PersistenceError> {
        self.with_lock(|| {
            let state = RecoveryState::from_set(codes);
            atomic_write_json(&self.directory, &self.data_path(), &state)
        })
    }

    pub fn remaining(&self) -> Result<usize, PersistenceError> {
        self.with_lock(|| Ok(read_recovery_state(&self.data_path())?.digests.len()))
    }

    fn data_path(&self) -> PathBuf {
        self.directory.join(RECOVERY_CODES_FILE)
    }

    fn with_lock<T>(
        &self,
        operation: impl FnOnce() -> Result<T, PersistenceError>,
    ) -> Result<T, PersistenceError> {
        validate_secure_directory(&self.directory)?;
        let lock = open_secure_lock(&self.directory.join(RECOVERY_LOCK_FILE))?;
        FileExt::lock_exclusive(&lock)?;
        operation()
    }
}

impl RecoveryCodeRepository for FilesystemRecoveryCodeRepository {
    type Error = PersistenceError;

    fn verify_and_consume(
        &self,
        digest: &RecoveryCodeDigest,
        authorized: bool,
    ) -> Result<bool, Self::Error> {
        self.with_lock(|| {
            let mut state = read_recovery_state(&self.data_path())?;
            let mut matching_index = None;
            for (index, stored) in state.digests.iter().enumerate() {
                let matched = bool::from(stored.0.ct_eq(&digest.0));
                if matched && matching_index.is_none() {
                    matching_index = Some(index);
                }
            }
            let Some(index) = matching_index else {
                return Ok(false);
            };
            if !authorized {
                return Ok(false);
            }
            state.digests.remove(index);
            atomic_write_json(&self.directory, &self.data_path(), &state)?;
            Ok(true)
        })
    }
}

#[derive(Debug, Clone)]
pub struct FilesystemTotpReplayRepository {
    directory: PathBuf,
}

impl FilesystemTotpReplayRepository {
    pub fn initialize(directory: &Path) -> Result<Self, PersistenceError> {
        prepare_secure_directory(directory)?;
        let target = directory.join(TOTP_REPLAY_FILE);
        let lock = open_secure_lock(&directory.join(TOTP_REPLAY_LOCK_FILE))?;
        FileExt::lock_exclusive(&lock)?;
        if fs::symlink_metadata(&target).is_ok() {
            return Err(PersistenceError::AlreadyInitialized);
        }
        atomic_write_json(directory, &target, &ReplayState::default())?;
        Self::open(directory)
    }

    pub fn open(directory: &Path) -> Result<Self, PersistenceError> {
        validate_secure_directory(directory)?;
        let target = directory.join(TOTP_REPLAY_FILE);
        validate_secure_file(&target)?;
        read_replay_state(&target)?;
        Ok(Self {
            directory: directory.to_owned(),
        })
    }

    fn data_path(&self) -> PathBuf {
        self.directory.join(TOTP_REPLAY_FILE)
    }

    fn with_lock<T>(
        &self,
        operation: impl FnOnce() -> Result<T, PersistenceError>,
    ) -> Result<T, PersistenceError> {
        validate_secure_directory(&self.directory)?;
        let lock = open_secure_lock(&self.directory.join(TOTP_REPLAY_LOCK_FILE))?;
        FileExt::lock_exclusive(&lock)?;
        operation()
    }
}

impl TotpReplayRepository for FilesystemTotpReplayRepository {
    type Error = PersistenceError;

    fn reserve_equivalent(
        &self,
        matched_counters: &[u64],
        current_counter: u64,
    ) -> Result<bool, Self::Error> {
        if matched_counters.is_empty() {
            return Ok(false);
        }
        let minimum = current_counter.saturating_sub(TOTP_MATCH_WINDOW_COUNTERS);
        let maximum = current_counter.saturating_add(TOTP_MATCH_WINDOW_COUNTERS);
        if matched_counters
            .iter()
            .any(|counter| *counter < minimum || *counter > maximum)
        {
            return Err(PersistenceError::CounterOutsideWindow);
        }
        self.with_lock(|| {
            let mut state = read_replay_state(&self.data_path())?;
            if state.high_water_counter.is_some_and(|high_water| {
                current_counter.saturating_add(TOTP_MAX_CLOCK_ROLLBACK_COUNTERS) < high_water
            }) {
                return Err(PersistenceError::ClockRollback);
            }
            let high_water = state
                .high_water_counter
                .map_or(current_counter, |value| value.max(current_counter));
            let retained_history =
                TOTP_MATCH_WINDOW_COUNTERS.saturating_add(TOTP_MAX_CLOCK_ROLLBACK_COUNTERS);
            let oldest_kept = high_water.saturating_sub(retained_history);
            state
                .used_counters
                .retain(|counter| *counter >= oldest_kept);
            if matched_counters
                .iter()
                .any(|counter| state.used_counters.contains(counter))
            {
                return Ok(false);
            }
            state.used_counters.extend_from_slice(matched_counters);
            state.used_counters.sort_unstable();
            state.used_counters.dedup();
            state.high_water_counter = Some(high_water);
            atomic_write_json(&self.directory, &self.data_path(), &state)?;
            Ok(true)
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredRecoveryState {
    version: u32,
    algorithm: String,
    digests: Vec<String>,
}

struct RecoveryState {
    digests: Vec<RecoveryCodeDigest>,
}

impl RecoveryState {
    fn from_set(set: &RecoveryCodeSet) -> Self {
        Self {
            digests: set.digests().to_vec(),
        }
    }
}

impl Serialize for RecoveryState {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        StoredRecoveryState {
            version: STATE_VERSION,
            algorithm: "sha256".to_owned(),
            digests: self
                .digests
                .iter()
                .map(|digest| URL_SAFE_NO_PAD.encode(digest.0))
                .collect(),
        }
        .serialize(serializer)
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ReplayState {
    version: u32,
    #[serde(default)]
    high_water_counter: Option<u64>,
    used_counters: Vec<u64>,
}

impl Default for ReplayState {
    fn default() -> Self {
        Self {
            version: STATE_VERSION,
            high_water_counter: None,
            used_counters: Vec::new(),
        }
    }
}

fn read_recovery_state(path: &Path) -> Result<RecoveryState, PersistenceError> {
    let bytes = read_secure_file(path)?;
    let stored: StoredRecoveryState =
        serde_json::from_slice(&bytes).map_err(|_| PersistenceError::InvalidData)?;
    if stored.version != STATE_VERSION || stored.algorithm != "sha256" {
        return Err(PersistenceError::InvalidData);
    }
    let mut digests = Vec::with_capacity(stored.digests.len());
    for encoded in stored.digests {
        let decoded = URL_SAFE_NO_PAD
            .decode(encoded.as_bytes())
            .map_err(|_| PersistenceError::InvalidData)?;
        let digest: [u8; 32] = decoded
            .try_into()
            .map_err(|_| PersistenceError::InvalidData)?;
        digests.push(RecoveryCodeDigest(digest));
    }
    let set = RecoveryCodeSet::from_digests(digests).map_err(|_| PersistenceError::InvalidData)?;
    Ok(RecoveryState::from_set(&set))
}

fn read_replay_state(path: &Path) -> Result<ReplayState, PersistenceError> {
    let bytes = read_secure_file(path)?;
    let state: ReplayState =
        serde_json::from_slice(&bytes).map_err(|_| PersistenceError::InvalidData)?;
    if state.version != STATE_VERSION {
        return Err(PersistenceError::InvalidData);
    }
    if state
        .used_counters
        .windows(2)
        .any(|pair| pair[0] >= pair[1])
    {
        return Err(PersistenceError::InvalidData);
    }
    match state.high_water_counter {
        None if !state.used_counters.is_empty() => return Err(PersistenceError::InvalidData),
        Some(high_water) => {
            let retained_history =
                TOTP_MATCH_WINDOW_COUNTERS.saturating_add(TOTP_MAX_CLOCK_ROLLBACK_COUNTERS);
            let oldest = high_water.saturating_sub(retained_history);
            let newest = high_water.saturating_add(TOTP_MATCH_WINDOW_COUNTERS);
            if state
                .used_counters
                .iter()
                .any(|counter| *counter < oldest || *counter > newest)
            {
                return Err(PersistenceError::InvalidData);
            }
        }
        _ => {}
    }
    Ok(state)
}

fn prepare_secure_directory(path: &Path) -> Result<(), PersistenceError> {
    match fs::symlink_metadata(path) {
        Ok(_) => validate_secure_directory(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let mut builder = fs::DirBuilder::new();
            builder.recursive(true).mode(DIRECTORY_MODE).create(path)?;
            fs::set_permissions(path, fs::Permissions::from_mode(DIRECTORY_MODE))?;
            validate_secure_directory(path)
        }
        Err(error) => Err(error.into()),
    }
}

fn validate_secure_directory(path: &Path) -> Result<(), PersistenceError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() {
        return Err(PersistenceError::SymlinkRejected);
    }
    if !metadata.is_dir() || metadata.mode() & 0o777 != DIRECTORY_MODE {
        return Err(PersistenceError::InsecureDirectory);
    }
    validate_owner(&metadata)
}

fn validate_secure_file(path: &Path) -> Result<(), PersistenceError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() {
        return Err(PersistenceError::SymlinkRejected);
    }
    if !metadata.is_file() || metadata.mode() & 0o777 != FILE_MODE {
        return Err(PersistenceError::InsecureFile);
    }
    validate_owner(&metadata)
}

fn validate_owner(metadata: &fs::Metadata) -> Result<(), PersistenceError> {
    if metadata.uid() != rustix::process::geteuid().as_raw() {
        Err(PersistenceError::WrongOwner)
    } else {
        Ok(())
    }
}

fn open_secure_lock(path: &Path) -> Result<File, PersistenceError> {
    let file = match OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .mode(FILE_MODE)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)
    {
        Ok(file) => {
            file.set_permissions(fs::Permissions::from_mode(FILE_MODE))?;
            file
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            validate_secure_file(path)?;
            OpenOptions::new()
                .read(true)
                .write(true)
                .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
                .open(path)?
        }
        Err(error) => return Err(error.into()),
    };
    validate_secure_file(path)?;
    Ok(file)
}

fn read_secure_file(path: &Path) -> Result<Vec<u8>, PersistenceError> {
    validate_secure_file(path)?;
    let file = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)?;
    if file.metadata()?.len() > MAX_STATE_BYTES {
        return Err(PersistenceError::InvalidData);
    }
    let mut bytes = Vec::new();
    file.take(MAX_STATE_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_STATE_BYTES {
        return Err(PersistenceError::InvalidData);
    }
    Ok(bytes)
}

fn atomic_write_json<T: Serialize>(
    directory: &Path,
    target: &Path,
    value: &T,
) -> Result<(), PersistenceError> {
    validate_secure_directory(directory)?;
    if fs::symlink_metadata(target).is_ok() {
        validate_secure_file(target)?;
    }
    let mut bytes = serde_json::to_vec(value).map_err(|_| PersistenceError::InvalidData)?;
    bytes.push(b'\n');
    if bytes.len() as u64 > MAX_STATE_BYTES {
        return Err(PersistenceError::InvalidData);
    }

    let (temporary_path, mut temporary) = create_temporary_file(directory)?;
    let result = (|| {
        temporary.write_all(&bytes)?;
        temporary.sync_all()?;
        drop(temporary);
        fs::rename(&temporary_path, target)?;
        validate_secure_file(target)?;
        File::open(directory)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn create_temporary_file(directory: &Path) -> Result<(PathBuf, File), PersistenceError> {
    for _ in 0..16 {
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = directory.join(format!(".auth-state-{}-{sequence}.tmp", std::process::id()));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(FILE_MODE)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(&path)
        {
            Ok(file) => {
                file.set_permissions(fs::Permissions::from_mode(FILE_MODE))?;
                validate_secure_file(&path)?;
                return Ok((path, file));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(PersistenceError::Io(std::io::Error::new(
        std::io::ErrorKind::AlreadyExists,
        "temporary authentication state name exhausted",
    )))
}

#[cfg(test)]
mod tests {
    use std::{
        convert::Infallible,
        os::unix::fs::{PermissionsExt, symlink},
        sync::{Arc, Barrier},
    };

    use super::super::{RandomSource, RecoveryCodeSet};
    use super::*;

    struct CounterRandom(u8);

    impl RandomSource for CounterRandom {
        type Error = Infallible;

        fn fill(&mut self, destination: &mut [u8]) -> Result<(), Self::Error> {
            for byte in destination {
                *byte = self.0;
                self.0 = self.0.wrapping_add(1);
            }
            Ok(())
        }
    }

    #[test]
    fn recovery_scan_is_read_only_when_unauthorized_and_consumption_is_durable() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("auth");
        let (set, codes) = RecoveryCodeSet::generate(&mut CounterRandom(0)).unwrap();
        let repository = FilesystemRecoveryCodeRepository::initialize(&directory, &set).unwrap();
        let digest = codes[0].digest();
        assert!(!repository.verify_and_consume(&digest, false).unwrap());
        assert_eq!(repository.remaining().unwrap(), 10);
        assert!(repository.verify_and_consume(&digest, true).unwrap());
        assert_eq!(
            FilesystemRecoveryCodeRepository::open(&directory)
                .unwrap()
                .remaining()
                .unwrap(),
            9
        );
        assert!(!repository.verify_and_consume(&digest, true).unwrap());
    }

    #[test]
    fn exclusive_recovery_transaction_allows_only_one_concurrent_consumer() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("auth");
        let (set, codes) = RecoveryCodeSet::generate(&mut CounterRandom(0)).unwrap();
        FilesystemRecoveryCodeRepository::initialize(&directory, &set).unwrap();
        let digest = codes[0].digest();
        let barrier = Arc::new(Barrier::new(3));
        let mut workers = Vec::new();
        for _ in 0..2 {
            let repository = FilesystemRecoveryCodeRepository::open(&directory).unwrap();
            let barrier = Arc::clone(&barrier);
            workers.push(std::thread::spawn(move || {
                barrier.wait();
                repository.verify_and_consume(&digest, true).unwrap()
            }));
        }
        barrier.wait();
        let results: Vec<_> = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|consumed| **consumed).count(), 1);
    }

    #[test]
    fn replay_reservation_is_visible_after_repository_reconstruction() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("auth");
        let repository = FilesystemTotpReplayRepository::initialize(&directory).unwrap();
        assert!(repository.reserve_equivalent(&[10, 11], 10).unwrap());
        let restarted = FilesystemTotpReplayRepository::open(&directory).unwrap();
        assert!(!restarted.reserve_equivalent(&[11], 11).unwrap());
        assert!(restarted.reserve_equivalent(&[12], 11).unwrap());
        assert!(matches!(
            restarted.reserve_equivalent(&[2], 2),
            Err(PersistenceError::ClockRollback)
        ));
    }

    #[test]
    fn one_step_clock_rollback_keeps_the_complete_candidate_history() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("auth");
        let repository = FilesystemTotpReplayRepository::initialize(&directory).unwrap();

        assert!(repository.reserve_equivalent(&[98], 99).unwrap());
        assert!(repository.reserve_equivalent(&[100], 100).unwrap());

        let restarted = FilesystemTotpReplayRepository::open(&directory).unwrap();
        assert!(!restarted.reserve_equivalent(&[98], 99).unwrap());
        assert!(matches!(
            restarted.reserve_equivalent(&[97], 98),
            Err(PersistenceError::ClockRollback)
        ));

        let persisted = read_replay_state(&directory.join(TOTP_REPLAY_FILE)).unwrap();
        assert_eq!(persisted.high_water_counter, Some(100));
        assert_eq!(persisted.used_counters, vec![98, 100]);
        assert!(
            persisted
                .used_counters
                .iter()
                .all(|counter| { (98..=101).contains(counter) })
        );
    }

    #[test]
    fn replay_state_rejects_counters_outside_the_retained_range() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("auth");
        FilesystemTotpReplayRepository::initialize(&directory).unwrap();
        let path = directory.join(TOTP_REPLAY_FILE);
        fs::write(
            &path,
            r#"{"version":1,"high_water_counter":100,"used_counters":[97]}"#,
        )
        .unwrap();
        assert!(matches!(
            FilesystemTotpReplayRepository::open(&directory),
            Err(PersistenceError::InvalidData)
        ));
    }

    #[test]
    fn concurrent_initialization_has_one_winner() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("auth");
        let barrier = Arc::new(Barrier::new(3));
        let mut workers = Vec::new();
        for _ in 0..2 {
            let directory = directory.clone();
            let barrier = Arc::clone(&barrier);
            workers.push(std::thread::spawn(move || {
                barrier.wait();
                FilesystemTotpReplayRepository::initialize(&directory)
            }));
        }
        barrier.wait();
        let results: Vec<_> = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(
            results
                .iter()
                .filter(|result| matches!(result, Err(PersistenceError::AlreadyInitialized)))
                .count(),
            1
        );
    }

    #[test]
    fn state_rejects_wrong_modes_and_symlinks() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("auth");
        FilesystemTotpReplayRepository::initialize(&directory).unwrap();
        fs::set_permissions(&directory, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(matches!(
            FilesystemTotpReplayRepository::open(&directory),
            Err(PersistenceError::InsecureDirectory)
        ));

        fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
        let replay = directory.join(TOTP_REPLAY_FILE);
        fs::set_permissions(&replay, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(matches!(
            FilesystemTotpReplayRepository::open(&directory),
            Err(PersistenceError::InsecureFile)
        ));
        fs::set_permissions(&replay, fs::Permissions::from_mode(0o600)).unwrap();
        fs::remove_file(&replay).unwrap();
        symlink("/dev/null", &replay).unwrap();
        assert!(matches!(
            FilesystemTotpReplayRepository::open(&directory),
            Err(PersistenceError::SymlinkRejected)
        ));
    }

    #[test]
    fn created_directory_data_and_lock_files_have_exact_modes() {
        let temp = tempfile::tempdir().unwrap();
        let directory = temp.path().join("auth");
        let repository = FilesystemTotpReplayRepository::initialize(&directory).unwrap();
        repository.reserve_equivalent(&[10], 10).unwrap();
        assert_eq!(
            fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(directory.join(TOTP_REPLAY_FILE))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(directory.join(TOTP_REPLAY_LOCK_FILE))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}
