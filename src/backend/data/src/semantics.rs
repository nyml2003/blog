//! 数据语义（`mock` / `test` / `prod`）与 test 语义的临时库生命周期。
//!
//! - `mock`：内存夹具，**不创建、不打开任何 SQLite 文件**（SPEC-OPS-RUNTIME-001-MODE-002）；
//! - `test`：每次运行全新临时 SQLite，自动迁移 + 稳定 seed；位于 `target/test-dbs/`、
//!   以进程 PID 命名；**正常退出即删除，异常退出保留供诊断**（MODE-003）；
//! - `prod`：显式指定的仓库外 SQLite 文件，自动迁移、不加载 seed、正常退出不删除。

use std::io;
use std::path::{Path, PathBuf};

/// 数据语义决定存储位置、初始化方式和退出时的生命周期。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Semantics {
    #[default]
    Mock,
    Test,
    Prod,
}

impl Semantics {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "mock" => Some(Self::Mock),
            "test" => Some(Self::Test),
            "prod" => Some(Self::Prod),
            _ => None,
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Mock => "mock",
            Self::Test => "test",
            Self::Prod => "prod",
        }
    }

    /// 三种语义都允许进入启动流程；具体存储生命周期由 [`StorageLayout`] 决定。
    pub const fn runnable(self) -> bool {
        true
    }
}

/// 运行时存储布局；`mock` 语义为 [`StorageLayout::None`]。
#[derive(Debug, Clone)]
pub enum StorageLayout {
    None,
    TempFile(TempDb),
    PersistentFile(PersistentDb),
}

/// 临时库路径 + 三件套清理（`.db` / `-wal` / `-shm`，WAL 模式会产生 sidecar 文件）。
#[derive(Debug, Clone)]
pub struct TempDb {
    path: PathBuf,
}

impl TempDb {
    /// ops 注入路径优先（`BLOG_DATABASE_PATH`）；未注入时回退到 `target/test-dbs/<PID>.db`
    /// （相对当前工作目录，启动日志会打印绝对路径）。
    pub fn resolve(injected: Option<&Path>) -> Self {
        let path = match injected {
            Some(path) => path.to_path_buf(),
            None => default_test_db_path(),
        };
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// 创建父目录（`target/test-dbs/`）。
    pub fn prepare(&self) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)?;
            }
        }
        Ok(())
    }

    /// 正常退出时删除库文件与 WAL sidecar；返回实际删除的文件列表。
    pub fn remove(&self) -> Vec<PathBuf> {
        let mut removed = Vec::new();
        for candidate in self.candidates() {
            match std::fs::remove_file(&candidate) {
                Ok(()) => removed.push(candidate),
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => {
                    crate::data_error!(
                        "temp db cleanup failed path={} error={}",
                        candidate.display(),
                        error
                    );
                }
            }
        }
        removed
    }

    fn candidates(&self) -> Vec<PathBuf> {
        let mut all = vec![self.path.clone()];
        let name = self
            .path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        if let Some(parent) = self.path.parent() {
            all.push(parent.join(format!("{name}-wal")));
            all.push(parent.join(format!("{name}-shm")));
            all.push(parent.join(format!("{name}-journal")));
        }
        all
    }
}

/// `prod` 语义下的持久库句柄；只负责路径和父目录，不负责删除文件。
#[derive(Debug, Clone)]
pub struct PersistentDb {
    path: PathBuf,
}

impl PersistentDb {
    pub fn resolve(path: &Path) -> Self {
        Self {
            path: path.to_path_buf(),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn prepare(&self) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)?;
            }
        }
        Ok(())
    }
}

/// `target/test-dbs/<PID>.db`，相对当前工作目录解析。
pub fn default_test_db_path() -> PathBuf {
    PathBuf::from("target")
        .join("test-dbs")
        .join(format!("{}.db", std::process::id()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_semantics_only() {
        assert_eq!(Semantics::parse("mock"), Some(Semantics::Mock));
        assert_eq!(Semantics::parse("test"), Some(Semantics::Test));
        assert_eq!(Semantics::parse("prod"), Some(Semantics::Prod));
        assert_eq!(Semantics::parse("Mock"), None);
        assert_eq!(Semantics::parse(""), None);
        assert!(Semantics::Mock.runnable());
        assert!(Semantics::Test.runnable());
        assert!(Semantics::Prod.runnable());
    }

    #[test]
    fn temp_db_cleanup_covers_wal_sidecars() {
        let dir = std::env::temp_dir().join(format!("data-semantics-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("clean.db");
        std::fs::write(&path, b"x").unwrap();
        std::fs::write(dir.join("clean.db-wal"), b"x").unwrap();
        std::fs::write(dir.join("clean.db-shm"), b"x").unwrap();

        let removed = TempDb { path: path.clone() }.remove();
        assert!(removed.contains(&path));
        assert!(!path.exists());
        assert!(!dir.join("clean.db-wal").exists());
        assert!(!dir.join("clean.db-shm").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn injected_path_wins_over_default() {
        let custom = TempDb::resolve(Some(Path::new("/tmp/ops-injected/db.sqlite3")));
        assert_eq!(custom.path(), Path::new("/tmp/ops-injected/db.sqlite3"));

        let fallback = TempDb::resolve(None);
        assert!(fallback.path().starts_with("target/test-dbs/"));
        assert!(
            fallback
                .path()
                .file_name()
                .unwrap()
                .to_string_lossy()
                .contains(&std::process::id().to_string())
        );
    }
}
