use std::{
    fs::{self, File, OpenOptions},
    io::{self, IsTerminal, Read, Write},
    os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    process::ExitCode,
};

use product::auth::{
    ADMIN_PASSWORD_HASH_ENV, ADMIN_RUNTIME_DIR_ENV, ADMIN_TOTP_SECRET_ENV,
    Argon2idPasswordVerifier, FilesystemRecoveryCodeRepository, FilesystemTotpReplayRepository,
    OsRandomSource, PasswordVerifier, RandomSource, RecoveryCodeSet, SecretString,
    encode_base32_no_padding,
};

const CREDENTIALS_FILE: &str = "credentials.env";

fn main() -> ExitCode {
    if !io::stdin().is_terminal() || !io::stdout().is_terminal() || !io::stderr().is_terminal() {
        eprintln!("[admin-credentials] stdin, stdout and stderr must be attached to a TTY");
        return ExitCode::from(20);
    }
    match run(std::env::args().skip(1).collect()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("[admin-credentials] {message}");
            ExitCode::from(20)
        }
    }
}

fn run(args: Vec<String>) -> Result<(), &'static str> {
    let (operation, state_dir) = parse_args(args)?;
    match operation.as_str() {
        "init" => initialize(&state_dir),
        "recovery-regenerate" => regenerate_recovery(&state_dir),
        _ => Err("usage: blog-admin-credentials <init|recovery-regenerate> --state-dir <PATH>"),
    }
}

fn parse_args(args: Vec<String>) -> Result<(String, PathBuf), &'static str> {
    if args.len() != 3 || args[1] != "--state-dir" || args[2].is_empty() {
        return Err("usage: blog-admin-credentials <init|recovery-regenerate> --state-dir <PATH>");
    }
    Ok((args[0].clone(), PathBuf::from(&args[2])))
}

fn initialize(state_dir: &Path) -> Result<(), &'static str> {
    let password = prompt_confirmed_password()?;
    let verifier = Argon2idPasswordVerifier::default();
    let mut random = OsRandomSource;
    let password_hash = verifier
        .hash_password(&password, &mut random)
        .map_err(|_| "password hashing failed")?;
    let mut totp_bytes = [0_u8; 20];
    random
        .fill(&mut totp_bytes)
        .map_err(|_| "random generation failed")?;
    let totp_secret = encode_base32_no_padding(&totp_bytes);
    let (recovery_set, recovery_codes) =
        RecoveryCodeSet::generate(&mut random).map_err(|_| "recovery-code generation failed")?;

    FilesystemRecoveryCodeRepository::initialize(state_dir, &recovery_set)
        .map_err(|_| "recovery state initialization failed")?;
    FilesystemTotpReplayRepository::initialize(state_dir)
        .map_err(|_| "TOTP replay state initialization failed")?;
    write_credentials(state_dir, password_hash.expose(), &totp_secret)?;

    println!("TOTP secret (shown once): {totp_secret}");
    println!("Recovery codes (shown once):");
    for code in recovery_codes {
        println!("{}", group_code(code.expose()));
    }
    Ok(())
}

fn regenerate_recovery(state_dir: &Path) -> Result<(), &'static str> {
    let (password_hash, _) = read_credentials(state_dir)?;
    let password = SecretString::new(
        rpassword::prompt_password("Current admin password: ")
            .map_err(|_| "password input failed")?,
    );
    if !Argon2idPasswordVerifier::default()
        .verify(&SecretString::new(password_hash), &password)
        .map_err(|_| "stored password hash is invalid")?
    {
        return Err("password verification failed");
    }
    let mut random = OsRandomSource;
    let (set, codes) =
        RecoveryCodeSet::generate(&mut random).map_err(|_| "recovery-code generation failed")?;
    FilesystemRecoveryCodeRepository::open(state_dir)
        .map_err(|_| "recovery state unavailable")?
        .replace(&set)
        .map_err(|_| "recovery state replacement failed")?;
    println!("Recovery codes (shown once):");
    for code in codes {
        println!("{}", group_code(code.expose()));
    }
    Ok(())
}

fn prompt_confirmed_password() -> Result<SecretString, &'static str> {
    let first =
        rpassword::prompt_password("New admin password: ").map_err(|_| "password input failed")?;
    let second = rpassword::prompt_password("Confirm admin password: ")
        .map_err(|_| "password input failed")?;
    if first.is_empty() || first != second {
        return Err("password confirmation does not match");
    }
    Ok(SecretString::new(first))
}

fn write_credentials(
    state_dir: &Path,
    password_hash: &str,
    totp_secret: &str,
) -> Result<(), &'static str> {
    let target = state_dir.join(CREDENTIALS_FILE);
    if fs::symlink_metadata(&target).is_ok() {
        return Err("credentials already initialized");
    }
    let runtime = state_dir.to_str().ok_or("state directory is not UTF-8")?;
    if runtime.contains(['\n', '\r']) {
        return Err("state directory contains a newline");
    }
    let bytes = format!(
        "{ADMIN_PASSWORD_HASH_ENV}={password_hash}\n{ADMIN_TOTP_SECRET_ENV}={totp_secret}\n{ADMIN_RUNTIME_DIR_ENV}={runtime}\n"
    );
    let temporary = state_dir.join(format!(".credentials-{}.tmp", std::process::id()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(&temporary)
        .map_err(|_| "create credentials temporary file failed")?;
    file.set_permissions(fs::Permissions::from_mode(0o600))
        .map_err(|_| "set credentials permissions failed")?;
    file.write_all(bytes.as_bytes())
        .map_err(|_| "write credentials failed")?;
    file.sync_all().map_err(|_| "sync credentials failed")?;
    drop(file);
    fs::rename(&temporary, &target).map_err(|_| "commit credentials failed")?;
    File::open(state_dir)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| "sync credentials directory failed")?;
    Ok(())
}

fn read_credentials(state_dir: &Path) -> Result<(String, String), &'static str> {
    let path = state_dir.join(CREDENTIALS_FILE);
    let metadata = fs::symlink_metadata(&path).map_err(|_| "credentials unavailable")?;
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.permissions().mode() & 0o777 != 0o600
        || metadata.uid() != rustix::process::geteuid().as_raw()
    {
        return Err("credentials permissions are invalid");
    }
    let mut text = String::new();
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)
        .and_then(|file| file.take(8193).read_to_string(&mut text))
        .map_err(|_| "read credentials failed")?;
    if text.len() > 8192 {
        return Err("credentials file is too large");
    }
    let mut password_hash = None;
    let mut totp_secret = None;
    for line in text.lines() {
        let (name, value) = line.split_once('=').ok_or("credentials file is invalid")?;
        match name {
            ADMIN_PASSWORD_HASH_ENV if password_hash.is_none() => {
                password_hash = Some(value.to_owned())
            }
            ADMIN_TOTP_SECRET_ENV if totp_secret.is_none() => totp_secret = Some(value.to_owned()),
            ADMIN_RUNTIME_DIR_ENV => {}
            _ => return Err("credentials file is invalid"),
        }
    }
    Ok((
        password_hash.ok_or("password hash missing")?,
        totp_secret.ok_or("TOTP secret missing")?,
    ))
}

fn group_code(code: &str) -> String {
    code.as_bytes()
        .chunks(4)
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("-")
}
