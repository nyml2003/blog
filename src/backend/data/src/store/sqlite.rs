//! `test` 语义后端：SQLx `SqlitePool` + `sqlx::migrate!()` + 运行期 `sqlx::query`。
//!
//! 关键约束（PLAN「Rust 运行时与 I/O 架构」）：
//! - 运行期 `sqlx::query` API，不用 `query!` 编译期宏；
//! - worker 是同步线程，因此通过 `tokio::runtime::Handle::block_on` 驱动
//!   `SqlitePool` 的异步 API（业务 runtime 保持 `current_thread`，不做嵌套 runtime）；
//! - 列表读取保持**固定查询数**：count + 当前页 + 批量 terms（`IN (...)`），
//!   禁止逐条 detail（N+1 边界）。

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::time::Duration;

use protocol::envelope::codes;
use protocol::{
    ArticleBrowseQuery, ArticleDetail, ArticleGetQuery, ArticleId, ArticleListItem,
    ArticleListPage, ArticleListQuery, ArticleShelfData, ArticleShelfQuery, ArticleType,
    ArticleTypeListQuery, ArticleTypeName, ArticleTypeRename, ArticleWrite, DatabaseDiagnostics,
    MAX_SUMMARY_CHARS, OperationFailure, Term, TermListQuery, TermRef, TermRename, TermWrite, Unit,
    has_more, normalize_page, normalize_page_size,
};
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteRow, SqliteSynchronous,
};
use sqlx::{ColumnIndex, Decode, Row, Sqlite, SqliteConnection, SqlitePool, Type};
use tokio::runtime::Handle;

use super::{ArticleFilter, DataStore, OpCtx};
use crate::fixture;
use protocol::dates::exclusive_date_end;

/// 本地单机 SQLite：少量连接 + WAL；写路径本期只有 seed，读路径并发安全。
const MAX_CONNECTIONS: u32 = 4;
const ACQUIRE_TIMEOUT: Duration = Duration::from_secs(5);
const CLOSE_TIMEOUT: Duration = Duration::from_millis(1500);
const SHARE_ATTRIBUTION_TTL_SECONDS: i64 = 90 * 24 * 60 * 60;
const SHARE_ATTRIBUTION_LIMIT: i64 = 10_000;

/// 单个 SQL 参数（运行期绑定；`sqlx::query` 不做编译期类型检查）。
#[derive(Debug, Clone)]
enum Bind {
    Int(i64),
    Text(String),
}

impl Bind {
    fn apply<'q>(
        &'q self,
        query: sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    ) -> sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
        match self {
            Bind::Int(value) => query.bind(*value),
            Bind::Text(value) => query.bind(value.as_str()),
        }
    }
}

/// 文章行投影（单处维护，页查询 / 详情 / 批量 id 读取共用同一别名集合）。
const ARTICLE_COLUMNS: &str = "a.id AS id, a.title AS title, a.summary AS summary, \
     a.article_type_id AS article_type_id, t.name AS type_name, a.content_html AS content_html, \
     a.status AS status, a.created_at AS created_at, a.updated_at AS updated_at, \
     a.published_at AS published_at";
const ARTICLE_FROM: &str = "FROM articles a JOIN article_types t ON t.id = a.article_type_id";

/// 事务守卫：与 [`Conn`] 同样的上下文要求（drop 时回滚同样依赖 `rt::spawn`）。
struct Tx<'a> {
    // 字段顺序即 drop 顺序：事务先于上下文守卫释放。
    tx: sqlx::Transaction<'static, Sqlite>,
    _enter: tokio::runtime::EnterGuard<'a>,
}

pub struct SqliteStore {
    pool: SqlitePool,
    handle: Handle,
    path: PathBuf,
    applied_migrations: Vec<i64>,
    seeded: bool,
}

/// 连接 + 运行时上下文守卫。
///
/// sqlx 在 `PoolConnection` drop 时会用 `sqlx_core::rt::spawn` 把连接归还连接池，
/// 这要求当前线程处于 tokio 运行时上下文；同步 worker 线程本身不是 runtime 线程，
/// 因此连接的生命周期内必须持有 [`Handle::enter`] 守卫。
struct Conn<'a> {
    // 字段顺序即 drop 顺序：连接必须先于上下文守卫归还（守卫先释放会让 sqlx 的
    // `rt::spawn` 再次失去 tokio 上下文）。
    conn: sqlx::pool::PoolConnection<Sqlite>,
    _enter: tokio::runtime::EnterGuard<'a>,
}

impl SqliteStore {
    /// 打开连接池并**自动执行迁移**（`ops database migrate` 已被删除）。
    pub async fn open(path: &Path) -> Result<Self, OpenError> {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .busy_timeout(ACQUIRE_TIMEOUT);
        let pool = SqlitePoolOptions::new()
            .max_connections(MAX_CONNECTIONS)
            .min_connections(1)
            .acquire_timeout(ACQUIRE_TIMEOUT)
            .connect_with(options)
            .await
            .map_err(|error| OpenError(format!("connect sqlite {}: {error}", path.display())))?;
        let migrator = sqlx::migrate!("./migrations");
        migrator
            .run(&pool)
            .await
            .map_err(|error| OpenError(format!("apply migrations: {error}")))?;
        let applied_migrations = migrator.migrations.iter().map(|m| m.version).collect();
        crate::data_info!(
            "migrations applied count={} versions={:?}",
            migrator.migrations.len(),
            migrator
                .migrations
                .iter()
                .map(|m| m.version)
                .collect::<Vec<_>>()
        );
        Ok(Self {
            pool,
            handle: Handle::current(),
            path: path.to_path_buf(),
            applied_migrations,
            seeded: false,
        })
    }

    /// 稳定 seed（显式 id 插入，幂等可复现）。
    pub async fn seed(&mut self) -> Result<(), OpenError> {
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|error| OpenError(format!("begin seed transaction: {error}")))?;
        for kind in fixture::ARTICLE_TYPES {
            sqlx::query(
                "INSERT INTO article_types (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            )
            .bind(kind.id)
            .bind(kind.name)
            .bind(fixture::FIXTURE_STAMP)
            .bind(fixture::FIXTURE_STAMP)
            .execute(&mut *tx)
            .await
            .map_err(|error| OpenError(format!("seed article_types: {error}")))?;
        }
        for term in fixture::TERMS {
            sqlx::query(
                "INSERT INTO terms (id, name, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(term.id)
            .bind(term.name)
            .bind(term.kind)
            .bind(fixture::FIXTURE_STAMP)
            .bind(fixture::FIXTURE_STAMP)
            .execute(&mut *tx)
            .await
            .map_err(|error| OpenError(format!("seed terms: {error}")))?;
        }
        for article in fixture::ARTICLES {
            sqlx::query(
                "INSERT INTO articles (id, title, summary, article_type_id, content_html, status, created_at, updated_at, published_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(article.id)
            .bind(article.title)
            .bind(article.summary)
            .bind(article.article_type_id)
            .bind(article.content_html)
            .bind(article.status)
            .bind(article.created_at)
            .bind(article.updated_at)
            .bind(article.published_at)
            .execute(&mut *tx)
            .await
            .map_err(|error| OpenError(format!("seed articles: {error}")))?;
            for term_id in article.term_ids {
                sqlx::query("INSERT INTO article_terms (article_id, term_id) VALUES (?, ?)")
                    .bind(article.id)
                    .bind(term_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|error| OpenError(format!("seed article_terms: {error}")))?;
            }
        }
        sqlx::query("INSERT INTO recommendation_sets (id, created_at, is_active) VALUES (1, ?, 1)")
            .bind(fixture::FIXTURE_STAMP)
            .execute(&mut *tx)
            .await
            .map_err(|error| OpenError(format!("seed recommendation_sets: {error}")))?;
        for (position, article_id) in fixture::RECOMMENDATION_ARTICLE_IDS.iter().enumerate() {
            sqlx::query(
                "INSERT INTO recommendation_items (recommendation_set_id, article_id, position) VALUES (1, ?, ?)",
            )
            .bind(article_id)
            .bind(position as i64)
            .execute(&mut *tx)
            .await
                .map_err(|error| OpenError(format!("seed recommendation_items: {error}")))?;
        }
        let content_snapshot = serde_json::to_string(&fixture::content_snapshot())
            .map_err(|error| OpenError(format!("encode seed content snapshot: {error}")))?;
        sqlx::query("INSERT INTO content_snapshot (singleton, source_commit, snapshot_json) VALUES (1, 'fixture-main', ?)")
            .bind(content_snapshot)
            .execute(&mut *tx)
            .await
            .map_err(|error| OpenError(format!("seed content snapshot: {error}")))?;
        tx.commit()
            .await
            .map_err(|error| OpenError(format!("commit seed: {error}")))?;
        self.seeded = true;
        crate::data_info!(
            "seed loaded articles={} types={} terms={} recommendation_items={}",
            fixture::ARTICLES.len(),
            fixture::ARTICLE_TYPES.len(),
            fixture::TERMS.len(),
            fixture::RECOMMENDATION_ARTICLE_IDS.len()
        );
        Ok(())
    }

    pub fn applied_migrations(&self) -> &[i64] {
        &self.applied_migrations
    }

    /// 关停：限时关闭连接池，超时则放弃等待（兜底清理由进程退出完成）。
    pub async fn close(&self) {
        let closed = tokio::time::timeout(CLOSE_TIMEOUT, self.pool.close()).await;
        match closed {
            Ok(()) => crate::data_info!("sqlite pool closed"),
            Err(_) => crate::data_error!(
                "sqlite pool close timed out after {}ms; forcing cleanup",
                CLOSE_TIMEOUT.as_millis()
            ),
        }
    }

    /// 在同步 worker 线程上驱动异步数据访问。
    fn block<F: std::future::Future>(&self, future: F) -> F::Output {
        self.handle.block_on(future)
    }

    fn begin(&self) -> Result<Tx<'_>, OperationFailure> {
        let enter = self.handle.enter();
        let tx = self.block(async {
            self.pool
                .begin()
                .await
                .map_err(|error| internal("begin transaction", &error))
        })?;
        Ok(Tx { tx, _enter: enter })
    }

    fn connect(&self) -> Result<Conn<'_>, OperationFailure> {
        let enter = self.handle.enter();
        let conn = self.block(async {
            self.pool
                .acquire()
                .await
                .map_err(|error| internal("acquire sqlite connection", &error))
        })?;
        Ok(Conn {
            conn,
            _enter: enter,
        })
    }

    fn fetch_all(
        &self,
        conn: &mut SqliteConnection,
        sql: &str,
        args: &[Bind],
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<SqliteRow>, OperationFailure> {
        self.block(async {
            let query = async {
                let mut statement = sqlx::query(sql);
                for arg in args {
                    statement = arg.apply(statement);
                }
                statement.fetch_all(conn).await
            };
            match tokio::time::timeout(ctx.remaining(), query).await {
                Ok(result) => result.map_err(|error| internal(sql, &error)),
                Err(_) => Err(OperationFailure::new(
                    codes::DEADLINE_EXCEEDED,
                    format!("query exceeded remaining budget: {sql}"),
                )),
            }
        })
    }

    fn fetch_optional(
        &self,
        conn: &mut SqliteConnection,
        sql: &str,
        args: &[Bind],
        ctx: &OpCtx<'_>,
    ) -> Result<Option<SqliteRow>, OperationFailure> {
        self.block(async {
            let query = async {
                let mut statement = sqlx::query(sql);
                for arg in args {
                    statement = arg.apply(statement);
                }
                statement.fetch_optional(conn).await
            };
            match tokio::time::timeout(ctx.remaining(), query).await {
                Ok(result) => result.map_err(|error| internal(sql, &error)),
                Err(_) => Err(OperationFailure::new(
                    codes::DEADLINE_EXCEEDED,
                    format!("query exceeded remaining budget: {sql}"),
                )),
            }
        })
    }

    /// **批量**关联加载：一次 `IN (...)` 覆盖整页文章 ID（不按条目循环）。
    fn fetch_all_tx(
        &self,
        tx: &mut sqlx::Transaction<'static, Sqlite>,
        sql: &str,
        args: &[Bind],
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<SqliteRow>, OperationFailure> {
        self.block(async {
            let query = async {
                let mut statement = sqlx::query(sql);
                for arg in args {
                    statement = arg.apply(statement);
                }
                statement.fetch_all(&mut **tx).await
            };
            match tokio::time::timeout(ctx.remaining(), query).await {
                Ok(result) => result.map_err(|error| internal(sql, &error)),
                Err(_) => Err(OperationFailure::new(
                    codes::DEADLINE_EXCEEDED,
                    format!("query exceeded remaining budget: {sql}"),
                )),
            }
        })
    }

    /// 事务内批量读取详情（推荐重建的回读阶段）。
    fn load_details_ordered_tx(
        &self,
        tx: &mut sqlx::Transaction<'static, Sqlite>,
        ids: &[i64],
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleDetail>, OperationFailure> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let sql = format!(
            "SELECT {ARTICLE_COLUMNS} {ARTICLE_FROM} WHERE a.id IN ({}) AND a.status = 'published'",
            placeholders_for(ids.len())
        );
        let args: Vec<Bind> = ids.iter().map(|id| Bind::Int(*id)).collect();
        let rows = self.fetch_all_tx(tx, &sql, &args, ctx)?;
        ctx.meter.record(1);
        let mut by_id: HashMap<i64, ArticleDetail> = HashMap::with_capacity(rows.len());
        for row in &rows {
            let detail = article_detail(row)?;
            by_id.insert(detail.id, detail);
        }
        let mut ordered: Vec<ArticleDetail> =
            ids.iter().filter_map(|id| by_id.remove(id)).collect();
        let all: Vec<i64> = ordered.iter().map(|detail| detail.id).collect();
        let terms = self.load_terms_batch(tx, &all, ctx)?;
        ctx.meter.record(1);
        for detail in &mut ordered {
            let article_terms = terms.get(&detail.id).cloned().unwrap_or_default();
            detail.terms = article_terms;
            detail.term_ids = detail.terms.iter().map(|term| term.id).collect();
        }
        Ok(ordered)
    }

    fn load_terms_batch(
        &self,
        conn: &mut SqliteConnection,
        article_ids: &[i64],
        ctx: &OpCtx<'_>,
    ) -> Result<HashMap<i64, Vec<TermRef>>, OperationFailure> {
        if article_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let placeholders = placeholders_for(article_ids.len());
        let sql = format!(
            "SELECT at.article_id AS article_id, t.id AS term_id, t.name AS term_name, t.kind AS term_kind \
             FROM article_terms at JOIN terms t ON t.id = at.term_id \
             WHERE at.article_id IN ({placeholders}) ORDER BY t.kind, t.name"
        );
        let args: Vec<Bind> = article_ids.iter().map(|id| Bind::Int(*id)).collect();
        let rows = self.fetch_all(conn, &sql, &args, ctx)?;
        let mut grouped: HashMap<i64, Vec<TermRef>> = HashMap::with_capacity(article_ids.len());
        for row in &rows {
            let article_id: i64 = column(row, "article_id")?;
            let term_id: i64 = column(row, "term_id")?;
            grouped.entry(article_id).or_default().push(TermRef {
                id: term_id,
                name: column(row, "term_name")?,
                kind: column(row, "term_kind")?,
            });
        }
        Ok(grouped)
    }
}

/// 行 → 列表投影（无正文 HTML）。
fn article_item(row: &SqliteRow) -> Result<ArticleListItem, OperationFailure> {
    let article_type_id: i64 = column(row, "article_type_id")?;
    let type_name: String = column(row, "type_name")?;
    Ok(ArticleListItem {
        id: column(row, "id")?,
        title: column(row, "title")?,
        summary: column(row, "summary")?,
        article_type_id,
        article_type: Some(protocol::ArticleTypeRef {
            id: article_type_id,
            name: type_name,
        }),
        status: column(row, "status")?,
        created_at: column(row, "created_at")?,
        updated_at: column(row, "updated_at")?,
        published_at: column(row, "published_at")?,
        term_ids: Vec::new(),
        terms: Vec::new(),
    })
}

/// 行 → 详情投影（列表投影 + 正文 HTML）。
fn article_detail(row: &SqliteRow) -> Result<ArticleDetail, OperationFailure> {
    let content_html: String = column(row, "content_html")?;
    Ok(into_detail(article_item(row)?, content_html))
}

/// 列表投影 → 详情投影（关联数据由调用方挂上）。
fn into_detail(item: ArticleListItem, content_html: String) -> ArticleDetail {
    ArticleDetail {
        id: item.id,
        title: item.title,
        summary: item.summary,
        article_type_id: item.article_type_id,
        article_type: item.article_type,
        content_html,
        status: item.status,
        created_at: item.created_at,
        updated_at: item.updated_at,
        published_at: item.published_at,
        term_ids: item.term_ids,
        terms: item.terms,
    }
}

/// 摘要领域规则（写入前调用）：去首尾空白，最多 160 个 Unicode 字符，空摘要合法。
fn normalize_summary(summary: &str) -> Result<String, OperationFailure> {
    let trimmed = summary.trim();
    let chars = trimmed.chars().count();
    if chars > MAX_SUMMARY_CHARS {
        return Err(OperationFailure::new(
            codes::INVALID_SUMMARY,
            format!("summary must be at most {MAX_SUMMARY_CHARS} unicode characters, got {chars}"),
        ));
    }
    Ok(trimmed.to_owned())
}

impl SqliteStore {
    /// 按给定 id 顺序批量读取文章（**一次** `IN` 查询 + 一次批量 terms，禁止逐条 detail）。
    fn load_articles_ordered(
        &self,
        conn: &mut SqliteConnection,
        ids: &[i64],
        published_only: bool,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleListItem>, OperationFailure> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let mut sql = format!(
            "SELECT {ARTICLE_COLUMNS} {ARTICLE_FROM} WHERE a.id IN ({})",
            placeholders_for(ids.len())
        );
        if published_only {
            sql.push_str(" AND a.status = 'published'");
        }
        let args: Vec<Bind> = ids.iter().map(|id| Bind::Int(*id)).collect();
        let rows = self.fetch_all(conn, &sql, &args, ctx)?;
        ctx.meter.record(1);
        let mut by_id: HashMap<i64, ArticleListItem> = HashMap::with_capacity(rows.len());
        for row in &rows {
            let item = article_item(row)?;
            by_id.insert(item.id, item);
        }
        // 保持调用方给定的顺序（推荐按 position，shelf 按排序结果）。
        Ok(ids.iter().filter_map(|id| by_id.remove(id)).collect())
    }

    /// 为一批文章挂上批量读取的 terms / type 信息。
    fn attach_relations(
        &self,
        conn: &mut SqliteConnection,
        items: &mut [ArticleListItem],
        ctx: &OpCtx<'_>,
    ) -> Result<(), OperationFailure> {
        let ids: Vec<i64> = items.iter().map(|item| item.id).collect();
        let terms = self.load_terms_batch(conn, &ids, ctx)?;
        ctx.meter.record(1);
        for item in items.iter_mut() {
            item.terms = terms.get(&item.id).cloned().unwrap_or_default();
            item.term_ids = item.terms.iter().map(|term| term.id).collect();
        }
        Ok(())
    }

    /// 读取当前生效推荐集合的 id（按 position），一次查询。
    fn recommendation_ids(&self, ctx: &OpCtx<'_>) -> Result<Vec<i64>, OperationFailure> {
        let mut conn = self.connect()?;
        let sql = "SELECT i.article_id AS article_id FROM recommendation_items i \
             JOIN recommendation_sets rs ON rs.id = i.recommendation_set_id \
             JOIN articles a ON a.id = i.article_id \
             WHERE rs.is_active = 1 AND a.status = 'published' ORDER BY i.position"
            .to_string();
        let rows = self.fetch_all(&mut conn.conn, &sql, &[], ctx)?;
        ctx.meter.record(1);
        rows.iter()
            .map(|row| column(row, "article_id"))
            .collect::<Result<Vec<_>, _>>()
    }

    /// 读取一批文章为详情投影（推荐集合用，含正文 HTML）。
    fn load_details_ordered(
        &self,
        conn: &mut SqliteConnection,
        ids: &[i64],
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleDetail>, OperationFailure> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let sql = format!(
            "SELECT {ARTICLE_COLUMNS} {ARTICLE_FROM} WHERE a.id IN ({}) AND a.status = 'published'",
            placeholders_for(ids.len())
        );
        let args: Vec<Bind> = ids.iter().map(|id| Bind::Int(*id)).collect();
        let rows = self.fetch_all(conn, &sql, &args, ctx)?;
        ctx.meter.record(1);
        let mut by_id: HashMap<i64, ArticleDetail> = HashMap::with_capacity(rows.len());
        for row in &rows {
            let detail = article_detail(row)?;
            by_id.insert(detail.id, detail);
        }
        let mut ordered: Vec<ArticleDetail> =
            ids.iter().filter_map(|id| by_id.remove(id)).collect();
        let all: Vec<i64> = ordered.iter().map(|detail| detail.id).collect();
        let terms = self.load_terms_batch(conn, &all, ctx)?;
        ctx.meter.record(1);
        for detail in &mut ordered {
            let article_terms = terms.get(&detail.id).cloned().unwrap_or_default();
            detail.terms = article_terms;
            detail.term_ids = detail.terms.iter().map(|term| term.id).collect();
        }
        Ok(ordered)
    }

    /// 写入 terms 关联：**单条**多值 INSERT（查询数与 term 数无关）。
    fn write_term_links(
        &self,
        executor: &mut SqliteConnection,
        article_id: i64,
        term_ids: &[i64],
        ctx: &OpCtx<'_>,
    ) -> Result<(), OperationFailure> {
        if term_ids.is_empty() {
            return Ok(());
        }
        let values = std::iter::repeat_n("(?, ?)", term_ids.len())
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!("INSERT INTO article_terms (article_id, term_id) VALUES {values}");
        let mut args = Vec::with_capacity(term_ids.len() * 2);
        for term_id in term_ids {
            args.push(Bind::Int(article_id));
            args.push(Bind::Int(*term_id));
        }
        self.execute(&mut *executor, &sql, &args, ctx)?;
        ctx.meter.record(1);
        Ok(())
    }

    fn execute(
        &self,
        conn: &mut SqliteConnection,
        sql: &str,
        args: &[Bind],
        ctx: &OpCtx<'_>,
    ) -> Result<sqlx::sqlite::SqliteQueryResult, OperationFailure> {
        self.block(async {
            let query = async {
                let mut statement = sqlx::query(sql);
                for arg in args {
                    statement = arg.apply(statement);
                }
                statement.execute(conn).await
            };
            match tokio::time::timeout(ctx.remaining(), query).await {
                Ok(result) => result.map_err(|error| map_write_error(sql, &error)),
                Err(_) => Err(OperationFailure::new(
                    codes::DEADLINE_EXCEEDED,
                    format!("statement exceeded remaining budget: {sql}"),
                )),
            }
        })
    }

    /// 事务内读取单篇（写操作返回更新后的完整视图，与 Go 参考实现一致）。
    fn read_detail_in_tx(
        &self,
        tx: &mut sqlx::Transaction<'static, Sqlite>,
        id: i64,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        let sql = format!("SELECT {ARTICLE_COLUMNS} {ARTICLE_FROM} WHERE a.id = ?");
        let row = self
            .fetch_optional_tx(tx, &sql, &[Bind::Int(id)], ctx)?
            .ok_or_else(|| not_found("article", id))?;
        ctx.meter.record(1);
        let mut detail = article_detail(&row)?;
        let terms = self.load_terms_batch(tx, &[id], ctx)?;
        let article_terms = terms.get(&id).cloned().unwrap_or_default();
        detail.terms = article_terms;
        detail.term_ids = detail.terms.iter().map(|term| term.id).collect();
        Ok(detail)
    }

    fn fetch_optional_tx(
        &self,
        tx: &mut sqlx::Transaction<'static, Sqlite>,
        sql: &str,
        args: &[Bind],
        ctx: &OpCtx<'_>,
    ) -> Result<Option<SqliteRow>, OperationFailure> {
        self.block(async {
            let query = async {
                let mut statement = sqlx::query(sql);
                for arg in args {
                    statement = arg.apply(statement);
                }
                statement.fetch_optional(&mut **tx).await
            };
            match tokio::time::timeout(ctx.remaining(), query).await {
                Ok(result) => result.map_err(|error| internal(sql, &error)),
                Err(_) => Err(OperationFailure::new(
                    codes::DEADLINE_EXCEEDED,
                    format!("query exceeded remaining budget: {sql}"),
                )),
            }
        })
    }
}

/// 写入失败 → 稳定失败码（唯一约束冲突 → `DUPLICATE_NAME`，其余 → `INTERNAL_ERROR`）。
fn map_write_error(sql: &str, error: &dyn std::fmt::Display) -> OperationFailure {
    let text = format!("{error}");
    if text.contains("UNIQUE constraint failed") || text.contains("FOREIGN KEY constraint failed") {
        return OperationFailure::new(codes::DUPLICATE_NAME, text);
    }
    internal(sql, &text.as_str())
}

fn content_workflow_conflict() -> OperationFailure {
    OperationFailure::new(
        codes::CONTENT_WORKFLOW_CHANGED,
        "content workflow revision changed before persistence",
    )
}

fn content_snapshot_conflict() -> OperationFailure {
    OperationFailure::new(
        codes::CONTENT_SNAPSHOT_CHANGED,
        "content snapshot source commit changed before replacement",
    )
}

fn not_found(kind: &str, id: i64) -> OperationFailure {
    OperationFailure::new(codes::NOT_FOUND, format!("{kind} {id} not found"))
}

impl DataStore for SqliteStore {
    fn share_attribution_record(
        &self,
        record: &protocol::ShareAttributionRecord,
        ctx: &OpCtx<'_>,
    ) -> Result<(), OperationFailure> {
        let cutoff = record
            .created_at_epoch
            .saturating_sub(SHARE_ATTRIBUTION_TTL_SECONDS);
        let mut tx = self.begin()?;
        self.execute(
            &mut tx.tx,
            "DELETE FROM share_attribution WHERE created_at_epoch < ?",
            &[Bind::Int(cutoff)],
            ctx,
        )?;
        self.execute(
            &mut tx.tx,
            "INSERT INTO share_attribution (token, article_id, created_at_epoch) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET article_id = excluded.article_id, created_at_epoch = excluded.created_at_epoch",
            &[
                Bind::Text(record.token.clone()),
                Bind::Int(record.article_id),
                Bind::Int(record.created_at_epoch),
            ],
            ctx,
        )?;
        self.execute(
            &mut tx.tx,
            "DELETE FROM share_attribution WHERE token IN (SELECT token FROM share_attribution ORDER BY created_at_epoch ASC, token ASC LIMIT -1 OFFSET ?)",
            &[Bind::Int(SHARE_ATTRIBUTION_LIMIT)],
            ctx,
        )?;
        self.block(async {
            tx.tx
                .commit()
                .await
                .map_err(|error| internal("commit share attribution", &error))
        })?;
        ctx.meter.record(3);
        Ok(())
    }

    fn content_workflow_write(
        &self,
        request: &protocol::ContentWorkflowWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<protocol::StoredContentWorkflow, OperationFailure> {
        if let Some(failure) = super::validation::content_workflow_failure(&request.state) {
            return Err(failure);
        }
        let payload = serde_json::to_string(&request.state)
            .map_err(|error| internal("serialize content workflow", &error))?;
        let revision = request
            .expected_revision
            .unwrap_or(0)
            .checked_add(1)
            .ok_or_else(content_workflow_conflict)?;
        let revision_i64 = i64::try_from(revision).map_err(|_| content_workflow_conflict())?;
        let mut conn = self.connect()?;
        let result = match request.expected_revision {
            None => self.execute(
                &mut conn.conn,
                "INSERT INTO content_workflow (singleton, revision, state_json) VALUES (1, ?, ?) ON CONFLICT(singleton) DO NOTHING",
                &[Bind::Int(revision_i64), Bind::Text(payload)],
                ctx,
            )?,
            Some(expected) => {
                let expected_i64 =
                    i64::try_from(expected).map_err(|_| content_workflow_conflict())?;
                self.execute(
                    &mut conn.conn,
                    "UPDATE content_workflow SET revision = ?, state_json = ? WHERE singleton = 1 AND revision = ?",
                    &[
                        Bind::Int(revision_i64),
                        Bind::Text(payload),
                        Bind::Int(expected_i64),
                    ],
                    ctx,
                )?
            }
        };
        ctx.meter.record(1);
        if result.rows_affected() != 1 {
            return Err(content_workflow_conflict());
        }
        Ok(protocol::StoredContentWorkflow {
            revision,
            state: request.state.clone(),
        })
    }

    fn content_workflow_get(
        &self,
        ctx: &OpCtx<'_>,
    ) -> Result<Option<protocol::StoredContentWorkflow>, OperationFailure> {
        let mut conn = self.connect()?;
        let row = self.fetch_optional(
            &mut conn.conn,
            "SELECT revision, state_json FROM content_workflow WHERE singleton = 1",
            &[],
            ctx,
        )?;
        ctx.meter.record(1);
        row.map(|row| {
            let revision: i64 = column(&row, "revision")?;
            let revision = u64::try_from(revision)
                .map_err(|error| internal("decode content workflow revision", &error))?;
            let payload: String = column(&row, "state_json")?;
            let state = serde_json::from_str(&payload)
                .map_err(|error| internal("decode stored content workflow", &error))?;
            Ok(protocol::StoredContentWorkflow { revision, state })
        })
        .transpose()
    }

    fn content_snapshot_replace(
        &self,
        request: &protocol::ContentSnapshotReplace,
        ctx: &OpCtx<'_>,
    ) -> Result<(), OperationFailure> {
        if let Some(failure) = super::validation::content_snapshot_failure(&request.snapshot) {
            return Err(failure);
        }
        if request.commit.trim().is_empty() {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "source commit must not be empty",
            ));
        }
        let projection = super::validation::legacy_projection(&request.snapshot)?;
        let payload = serde_json::to_string(&request.snapshot)
            .map_err(|error| internal("serialize content snapshot", &error))?;
        let mut tx = self.begin()?;
        let inserted_initial = match request.expected_previous_commit.as_deref() {
            None => {
                let result = self.execute(
                    &mut tx.tx,
                    "INSERT INTO content_snapshot (singleton, source_commit, snapshot_json) VALUES (1, ?, ?) ON CONFLICT(singleton) DO NOTHING",
                    &[
                        Bind::Text(request.commit.clone()),
                        Bind::Text(payload.clone()),
                    ],
                    ctx,
                )?;
                if result.rows_affected() != 1 {
                    return Err(content_snapshot_conflict());
                }
                true
            }
            Some(expected) => {
                let result = self.execute(
                    &mut tx.tx,
                    "UPDATE content_snapshot SET source_commit = source_commit WHERE singleton = 1 AND source_commit = ?",
                    &[Bind::Text(expected.to_owned())],
                    ctx,
                )?;
                if result.rows_affected() != 1 {
                    return Err(content_snapshot_conflict());
                }
                false
            }
        };
        ctx.meter.record(1);
        if !inserted_initial
            && let Some(row) = self.fetch_optional_tx(
                &mut tx.tx,
                "SELECT source_commit, snapshot_json FROM content_snapshot WHERE singleton = 1",
                &[],
                ctx,
            )?
        {
            let previous_json: String = column(&row, "snapshot_json")?;
            let previous: protocol::ContentSnapshot = serde_json::from_str(&previous_json)
                .map_err(|error| internal("decode previous content snapshot", &error))?;
            let previous_commit: String = column(&row, "source_commit")?;
            if previous_commit == request.commit {
                if previous == request.snapshot {
                    return Ok(());
                }
                return Err(OperationFailure::new(
                    codes::CONTENT_WORKFLOW_CHANGED,
                    "the same source commit cannot identify a different snapshot",
                ));
            }
            if let Some(failure) =
                super::validation::content_history_failure(&previous, &request.snapshot)
            {
                return Err(failure);
            }
        }
        for article in &projection.articles {
            if let Some(row) = self.fetch_optional_tx(&mut tx.tx, "SELECT created_at, first_published_at FROM content_article_identity WHERE article_id = ?", &[Bind::Int(article.id)], ctx)? {
                let created_at: String = column(&row, "created_at")?;
                let published_at: String = column(&row, "first_published_at")?;
                if created_at != article.created_at || published_at != article.published_at {
                    return Err(OperationFailure::new(codes::CONTENT_WORKFLOW_CHANGED, format!("article {} identity or first publication time changed", article.id)));
                }
            } else {
                self.execute(&mut tx.tx, "INSERT INTO content_article_identity (article_id, created_at, first_published_at) VALUES (?, ?, ?)", &[Bind::Int(article.id), Bind::Text(article.created_at.clone()), Bind::Text(article.published_at.clone())], ctx)?;
            }
        }
        let published_ids = projection
            .articles
            .iter()
            .map(|article| article.id)
            .collect::<BTreeSet<_>>();
        let previous_types = self
            .fetch_all_tx(
                &mut tx.tx,
                "SELECT id, name, created_at, updated_at FROM article_types",
                &[],
                ctx,
            )?
            .into_iter()
            .map(|row| {
                Ok((
                    column::<i64, _>(&row, "id")?,
                    (
                        column::<String, _>(&row, "name")?,
                        column::<String, _>(&row, "created_at")?,
                        column::<String, _>(&row, "updated_at")?,
                    ),
                ))
            })
            .collect::<Result<BTreeMap<_, _>, OperationFailure>>()?;
        let previous_terms = self
            .fetch_all_tx(
                &mut tx.tx,
                "SELECT id, name, kind, created_at, updated_at FROM terms",
                &[],
                ctx,
            )?
            .into_iter()
            .map(|row| {
                Ok((
                    column::<i64, _>(&row, "id")?,
                    (
                        column::<String, _>(&row, "name")?,
                        column::<String, _>(&row, "kind")?,
                        column::<String, _>(&row, "created_at")?,
                        column::<String, _>(&row, "updated_at")?,
                    ),
                ))
            })
            .collect::<Result<BTreeMap<_, _>, OperationFailure>>()?;
        let recommendation_rows = self.fetch_all_tx(
            &mut tx.tx,
            "SELECT recommendation_set_id, article_id, position FROM recommendation_items ORDER BY recommendation_set_id, position",
            &[],
            ctx,
        )?;
        let recommendations = recommendation_rows
            .iter()
            .map(|row| {
                Ok((
                    column::<i64, _>(row, "recommendation_set_id")?,
                    column::<i64, _>(row, "article_id")?,
                    column::<i64, _>(row, "position")?,
                ))
            })
            .collect::<Result<Vec<_>, OperationFailure>>()?
            .into_iter()
            .filter(|(_, article_id, _)| published_ids.contains(article_id))
            .collect::<Vec<_>>();
        self.execute(&mut tx.tx, "DELETE FROM recommendation_items", &[], ctx)?;
        self.execute(&mut tx.tx, "DELETE FROM article_terms", &[], ctx)?;
        self.execute(&mut tx.tx, "DELETE FROM articles", &[], ctx)?;
        self.execute(&mut tx.tx, "DELETE FROM terms", &[], ctx)?;
        self.execute(&mut tx.tx, "DELETE FROM article_types", &[], ctx)?;
        let stamp = protocol::clock::now_utc_rfc3339();
        for value in &projection.types {
            let (created_at, updated_at) = previous_types
                .get(&value.id)
                .map(|(name, created_at, updated_at)| {
                    (
                        created_at.clone(),
                        if name == &value.name {
                            updated_at.clone()
                        } else {
                            stamp.clone()
                        },
                    )
                })
                .unwrap_or_else(|| (stamp.clone(), stamp.clone()));
            self.execute(
                &mut tx.tx,
                "INSERT INTO article_types (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                &[
                    Bind::Int(value.id),
                    Bind::Text(value.name.clone()),
                    Bind::Text(created_at),
                    Bind::Text(updated_at),
                ],
                ctx,
            )?;
        }
        for value in &projection.terms {
            let (created_at, updated_at) = previous_terms
                .get(&value.id)
                .map(|(name, kind, created_at, updated_at)| {
                    (
                        created_at.clone(),
                        if name == &value.name && kind == value.kind {
                            updated_at.clone()
                        } else {
                            stamp.clone()
                        },
                    )
                })
                .unwrap_or_else(|| (stamp.clone(), stamp.clone()));
            self.execute(
                &mut tx.tx,
                "INSERT INTO terms (id, name, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                &[
                    Bind::Int(value.id),
                    Bind::Text(value.name.clone()),
                    Bind::Text(value.kind.to_owned()),
                    Bind::Text(created_at),
                    Bind::Text(updated_at),
                ],
                ctx,
            )?;
        }
        for value in &projection.articles {
            self.execute(&mut tx.tx, "INSERT INTO articles (id, title, summary, article_type_id, content_html, status, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?)", &[Bind::Int(value.id), Bind::Text(value.title.clone()), Bind::Text(value.summary.clone()), Bind::Int(value.article_type_id), Bind::Text(value.content_html.clone()), Bind::Text(value.created_at.clone()), Bind::Text(value.updated_at.clone()), Bind::Text(value.published_at.clone())], ctx)?;
            self.write_term_links(&mut tx.tx, value.id, &value.term_ids, ctx)?;
        }
        for (set_id, article_id, position) in recommendations {
            self.execute(
                &mut tx.tx,
                "INSERT INTO recommendation_items (recommendation_set_id, article_id, position) VALUES (?, ?, ?)",
                &[Bind::Int(set_id), Bind::Int(article_id), Bind::Int(position)],
                ctx,
            )?;
        }
        ctx.meter.record(1);
        self.execute(
            &mut tx.tx,
            "UPDATE content_snapshot SET source_commit = ?, snapshot_json = ? WHERE singleton = 1",
            &[Bind::Text(request.commit.clone()), Bind::Text(payload)],
            ctx,
        )?;
        ctx.meter.record(1);
        self.block(async {
            tx.tx
                .commit()
                .await
                .map_err(|error| internal("commit content snapshot", &error))
        })?;
        ctx.meter.record(1);
        Ok(())
    }

    fn content_snapshot_get(
        &self,
        ctx: &OpCtx<'_>,
    ) -> Result<Option<protocol::StoredContentSnapshot>, OperationFailure> {
        let mut conn = self.connect()?;
        let row = self.fetch_optional(
            &mut conn.conn,
            "SELECT source_commit, snapshot_json FROM content_snapshot WHERE singleton = 1",
            &[],
            ctx,
        )?;
        ctx.meter.record(1);
        row.map(|row| {
            let commit: String = column(&row, "source_commit")?;
            let payload: String = column(&row, "snapshot_json")?;
            let snapshot = serde_json::from_str(&payload)
                .map_err(|error| internal("decode stored content snapshot", &error))?;
            Ok(protocol::StoredContentSnapshot { commit, snapshot })
        })
        .transpose()
    }

    /// 固定 3 条查询：count → 当前页 → 批量 terms。查询数与条目数无关。
    fn article_list(
        &self,
        query: &ArticleListQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleListPage, OperationFailure> {
        let page = normalize_page(query.page);
        let page_size = normalize_page_size(query.page_size);
        let filter = ArticleFilter::from_query(query);
        let (where_sql, args) = build_article_where(
            query.published_only,
            &filter,
            query.search.as_deref(),
        );
        let mut conn = self.connect()?;

        // 1/3 count（与 Go 参考实现一致：JOIN article_types 过滤无类型文章）。
        let count_sql = format!(
            "SELECT COUNT(*) AS total FROM articles a \
             JOIN article_types t ON t.id = a.article_type_id{where_sql}"
        );
        let row = self
            .fetch_optional(&mut conn.conn, &count_sql, &args, ctx)?
            .ok_or_else(|| internal("count query returned no row", &"empty result"))?;
        let total: i64 = column(&row, "total")?;
        ctx.meter.record(1);

        // 取消检查点（批次间隙）：客户端已断开则不再继续读取。
        if ctx.canceled() {
            return Err(OperationFailure::new(
                codes::CANCELED,
                "article_list canceled before page read",
            ));
        }

        // 2/3 当前页。
        let page_sql = format!(
            "SELECT a.id AS id, a.title AS title, a.summary AS summary, \
                    a.article_type_id AS article_type_id, t.name AS type_name, \
                    a.status AS status, a.created_at AS created_at, a.updated_at AS updated_at, \
                    a.published_at AS published_at \
             FROM articles a JOIN article_types t ON t.id = a.article_type_id{where_sql} \
             ORDER BY a.updated_at DESC, a.id DESC LIMIT ? OFFSET ?"
        );
        let mut page_args = args.clone();
        page_args.push(Bind::Int(i64::from(page_size)));
        page_args.push(Bind::Int(i64::from(page - 1) * i64::from(page_size)));
        let rows = self.fetch_all(&mut conn.conn, &page_sql, &page_args, ctx)?;
        ctx.meter.record(1);
        let mut items: Vec<ArticleListItem> = Vec::with_capacity(rows.len());
        for row in &rows {
            let article_type_id: i64 = column(row, "article_type_id")?;
            let type_name: String = column(row, "type_name")?;
            items.push(ArticleListItem {
                id: column(row, "id")?,
                title: column(row, "title")?,
                summary: column(row, "summary")?,
                article_type_id,
                article_type: Some(protocol::ArticleTypeRef {
                    id: article_type_id,
                    name: type_name,
                }),
                status: column(row, "status")?,
                created_at: column(row, "created_at")?,
                updated_at: column(row, "updated_at")?,
                published_at: column(row, "published_at")?,
                term_ids: Vec::new(),
                terms: Vec::new(),
            });
        }
        if ctx.canceled() {
            return Err(OperationFailure::new(
                codes::CANCELED,
                "article_list canceled before batch term read",
            ));
        }

        // 3/3 批量关联（类型名已在页查询里 JOIN 取回，terms 用一次 IN 覆盖整页）。
        let ids: Vec<i64> = items.iter().map(|item| item.id).collect();
        let terms = self.load_terms_batch(&mut conn.conn, &ids, ctx)?;
        ctx.meter.record(1);
        for item in &mut items {
            item.terms = terms.get(&item.id).cloned().unwrap_or_default();
            item.term_ids = item.terms.iter().map(|term| term.id).collect();
        }

        Ok(ArticleListPage {
            items,
            page,
            page_size,
            total,
            has_more: has_more(page, page_size, total),
        })
    }

    /// 固定 2 条查询：单篇 + terms。
    fn article_get(
        &self,
        query: &ArticleGetQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        let mut sql = String::from(
            "SELECT a.id AS id, a.title AS title, a.summary AS summary, \
                    a.article_type_id AS article_type_id, t.name AS type_name, \
                    a.content_html AS content_html, a.status AS status, \
                    a.created_at AS created_at, a.updated_at AS updated_at, \
                    a.published_at AS published_at \
             FROM articles a JOIN article_types t ON t.id = a.article_type_id WHERE a.id = ?",
        );
        let args = vec![Bind::Int(query.id)];
        if query.published_only {
            sql.push_str(" AND a.status = 'published'");
        }
        let mut conn = self.connect()?;
        let row = self
            .fetch_optional(&mut conn.conn, &sql, &args, ctx)?
            .ok_or_else(|| {
                OperationFailure::new(codes::NOT_FOUND, format!("article {} not found", query.id))
            })?;
        ctx.meter.record(1);
        if ctx.canceled() {
            return Err(OperationFailure::new(
                codes::CANCELED,
                "article_get canceled before term read",
            ));
        }
        let terms = self.load_terms_batch(&mut conn.conn, &[query.id], ctx)?;
        ctx.meter.record(1);
        let article_terms = terms.get(&query.id).cloned().unwrap_or_default();
        Ok(ArticleDetail {
            id: column(&row, "id")?,
            title: column(&row, "title")?,
            summary: column(&row, "summary")?,
            article_type_id: column(&row, "article_type_id")?,
            article_type: Some(protocol::ArticleTypeRef {
                id: column(&row, "article_type_id")?,
                name: column(&row, "type_name")?,
            }),
            content_html: column(&row, "content_html")?,
            status: column(&row, "status")?,
            created_at: column(&row, "created_at")?,
            updated_at: column(&row, "updated_at")?,
            published_at: column(&row, "published_at")?,
            term_ids: article_terms.iter().map(|term| term.id).collect(),
            terms: article_terms,
        })
    }

    fn article_type_list(
        &self,
        query: &ArticleTypeListQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleType>, OperationFailure> {
        let mut sql = String::from(
            "SELECT id AS id, name AS name, created_at AS created_at, updated_at AS updated_at \
             FROM article_types ORDER BY name",
        );
        let mut args: Vec<Bind> = Vec::new();
        if let Some(limit) = query.limit {
            sql.push_str(" LIMIT ?");
            args.push(Bind::Int(i64::from(limit)));
        }
        let mut conn = self.connect()?;
        let rows = self.fetch_all(&mut conn.conn, &sql, &args, ctx)?;
        ctx.meter.record(1);
        let mut types: Vec<ArticleType> = Vec::with_capacity(rows.len());
        for row in &rows {
            types.push(ArticleType {
                id: column(row, "id")?,
                name: column(row, "name")?,
                created_at: column(row, "created_at")?,
                updated_at: column(row, "updated_at")?,
            });
        }
        Ok(types)
    }

    fn term_list(
        &self,
        query: &TermListQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<Term>, OperationFailure> {
        let mut sql = String::from(
            "SELECT id AS id, name AS name, kind AS kind, created_at AS created_at, updated_at AS updated_at \
             FROM terms",
        );
        let mut args: Vec<Bind> = Vec::new();
        if let Some(kind) = &query.kind {
            sql.push_str(" WHERE kind = ?");
            args.push(Bind::Text(kind.clone()));
        }
        sql.push_str(" ORDER BY kind, name");
        let mut conn = self.connect()?;
        let rows = self.fetch_all(&mut conn.conn, &sql, &args, ctx)?;
        ctx.meter.record(1);
        let mut terms: Vec<Term> = Vec::with_capacity(rows.len());
        for row in &rows {
            terms.push(Term {
                id: column(row, "id")?,
                name: column(row, "name")?,
                kind: column(row, "kind")?,
                created_at: column(row, "created_at")?,
                updated_at: column(row, "updated_at")?,
            });
        }
        Ok(terms)
    }

    /// 固定语句数：insert 文章(1) + 多值 terms(0/1) + 回读(2)。
    fn article_create(
        &self,
        write: &ArticleWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        let summary = normalize_summary(&write.summary)?;
        let stamp = protocol::clock::now_utc_rfc3339();
        let mut tx = self.begin()?;
        let insert = "INSERT INTO articles (title, summary, article_type_id, content_html, status, created_at, updated_at) \
                      VALUES (?, ?, ?, ?, 'draft', ?, ?)";
        self.execute(
            &mut tx.tx,
            insert,
            &[
                Bind::Text(write.title.clone()),
                Bind::Text(summary),
                Bind::Int(write.article_type_id),
                Bind::Text(write.content_html.clone()),
                Bind::Text(stamp.clone()),
                Bind::Text(stamp),
            ],
            ctx,
        )?;
        ctx.meter.record(1);
        let id: i64 = self
            .block(async {
                sqlx::query_scalar("SELECT last_insert_rowid()")
                    .fetch_one(&mut *tx.tx)
                    .await
            })
            .map_err(|error| internal("read last_insert_rowid", &error))?;
        ctx.meter.record(1);
        self.write_term_links(&mut tx.tx, id, &write.term_ids, ctx)?;
        let detail = self.read_detail_in_tx(&mut tx.tx, id, ctx)?;
        self.block(async {
            tx.tx
                .commit()
                .await
                .map_err(|error| internal("commit article_create", &error))
        })?;
        ctx.meter.record(1);
        Ok(detail)
    }

    /// 固定语句数：update 文章(1) + delete terms(1) + 多值 terms(0/1) + 回读(2)。
    fn article_update(
        &self,
        write: &ArticleWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        self.update_article(write, false, ctx)
    }

    fn article_update_draft(
        &self,
        write: &ArticleWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        self.update_article(write, true, ctx)
    }

    fn article_publish_checked(
        &self,
        checked: &protocol::ArticlePublishChecked,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        self.transition(checked.id, true, Some(&checked.content_html), ctx)
    }

    /// 单条 UPDATE；状态机不合法 → `INVALID_STATE_TRANSITION`（Go 参考实现同语义）。
    fn article_publish(
        &self,
        id: &ArticleId,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        self.transition(id.id, true, None, ctx)
    }

    fn article_unpublish(
        &self,
        id: &ArticleId,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        self.transition(id.id, false, None, ctx)
    }

    fn article_type_create(
        &self,
        name: &ArticleTypeName,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleType, OperationFailure> {
        let stamp = protocol::clock::now_utc_rfc3339();
        let mut conn = self.connect()?;
        let sql = "INSERT INTO article_types (name, created_at, updated_at) VALUES (?, ?, ?)";
        let result = self.execute(
            &mut conn.conn,
            sql,
            &[
                Bind::Text(name.name.trim().to_owned()),
                Bind::Text(stamp.clone()),
                Bind::Text(stamp.clone()),
            ],
            ctx,
        )?;
        ctx.meter.record(1);
        Ok(ArticleType {
            id: result.last_insert_rowid(),
            name: name.name.trim().to_owned(),
            created_at: stamp.clone(),
            updated_at: stamp,
        })
    }

    /// 名称唯一冲突 → `DUPLICATE_NAME`；目标不存在 → `NOT_FOUND`。
    fn article_type_update(
        &self,
        rename: &ArticleTypeRename,
        ctx: &OpCtx<'_>,
    ) -> Result<Unit, OperationFailure> {
        let mut conn = self.connect()?;
        let result = self.execute(
            &mut conn.conn,
            "UPDATE article_types SET name = ?, updated_at = ? WHERE id = ?",
            &[
                Bind::Text(rename.name.trim().to_owned()),
                Bind::Text(protocol::clock::now_utc_rfc3339()),
                Bind::Int(rename.id),
            ],
            ctx,
        )?;
        ctx.meter.record(1);
        if result.rows_affected() == 0 {
            return Err(not_found("article_type", rename.id));
        }
        Ok(Unit)
    }

    fn term_create(&self, write: &TermWrite, ctx: &OpCtx<'_>) -> Result<Term, OperationFailure> {
        let stamp = protocol::clock::now_utc_rfc3339();
        let kind = write.kind.trim();
        if kind != "topic" && kind != "tag" {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!("term kind must be 'topic' or 'tag', got '{kind}'"),
            ));
        }
        let mut conn = self.connect()?;
        let sql = "INSERT INTO terms (name, kind, created_at, updated_at) VALUES (?, ?, ?, ?)";
        let result = self.execute(
            &mut conn.conn,
            sql,
            &[
                Bind::Text(write.name.trim().to_owned()),
                Bind::Text(kind.to_owned()),
                Bind::Text(stamp.clone()),
                Bind::Text(stamp.clone()),
            ],
            ctx,
        )?;
        ctx.meter.record(1);
        Ok(Term {
            id: result.last_insert_rowid(),
            name: write.name.trim().to_owned(),
            kind: kind.to_owned(),
            created_at: stamp.clone(),
            updated_at: stamp,
        })
    }

    fn term_update(&self, rename: &TermRename, ctx: &OpCtx<'_>) -> Result<Unit, OperationFailure> {
        let mut conn = self.connect()?;
        let result = self.execute(
            &mut conn.conn,
            "UPDATE terms SET name = ?, updated_at = ? WHERE id = ?",
            &[
                Bind::Text(rename.name.trim().to_owned()),
                Bind::Text(protocol::clock::now_utc_rfc3339()),
                Bind::Int(rename.id),
            ],
            ctx,
        )?;
        ctx.meter.record(1);
        if result.rows_affected() == 0 {
            return Err(not_found("term", rename.id));
        }
        Ok(Unit)
    }

    /// 固定查询数：推荐 id(1) + 详情(1) + 批量 terms(1) —— 不做逐条 detail。
    fn recommendation_current(
        &self,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleDetail>, OperationFailure> {
        let ids = self.recommendation_ids(ctx)?;
        let mut conn = self.connect()?;
        self.load_details_ordered(&mut conn.conn, &ids, ctx)
    }

    /// 单事务：选 6 篇(1) + 停用旧集合(1) + 新集合(1) + items(1) + 回读(3)。
    fn recommendation_generate(
        &self,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleDetail>, OperationFailure> {
        let stamp = protocol::clock::now_utc_rfc3339();
        let mut tx = self.begin()?;
        let rows = self.fetch_all_tx(&mut tx.tx,
            "SELECT id AS id FROM articles WHERE status = 'published' ORDER BY updated_at DESC, id DESC LIMIT ?",
            &[Bind::Int(protocol::RECOMMENDATION_LIMIT as i64)], ctx)?;
        ctx.meter.record(1);
        let ids: Vec<i64> = rows
            .iter()
            .map(|row| column(row, "id"))
            .collect::<Result<_, _>>()?;
        self.execute(
            &mut tx.tx,
            "UPDATE recommendation_sets SET is_active = 0 WHERE is_active = 1",
            &[],
            ctx,
        )?;
        ctx.meter.record(1);
        let result = self.execute(
            &mut tx.tx,
            "INSERT INTO recommendation_sets (created_at, is_active) VALUES (?, 1)",
            &[Bind::Text(stamp)],
            ctx,
        )?;
        ctx.meter.record(1);
        let set_id = result.last_insert_rowid();
        if !ids.is_empty() {
            let values = std::iter::repeat_n("(?, ?, ?)", ids.len())
                .collect::<Vec<_>>()
                .join(", ");
            let sql = format!(
                "INSERT INTO recommendation_items (recommendation_set_id, article_id, position) VALUES {values}"
            );
            let mut args = Vec::with_capacity(ids.len() * 3);
            for (position, id) in ids.iter().enumerate() {
                args.push(Bind::Int(set_id));
                args.push(Bind::Int(*id));
                args.push(Bind::Int(position as i64));
            }
            self.execute(&mut tx.tx, &sql, &args, ctx)?;
            ctx.meter.record(1);
        }
        let details = self.load_details_ordered_tx(&mut tx.tx, &ids, ctx)?;
        self.block(async {
            tx.tx
                .commit()
                .await
                .map_err(|error| internal("commit recommendation_generate", &error))
        })?;
        ctx.meter.record(1);
        Ok(details)
    }

    /// mobile shelf 读模型输入。
    ///
    /// mobile shelf 读模型输入。
    ///
    /// 固定查询数 7：types(1) + count(1) + 全量筛选行(1) + 批量 terms(1) + 推荐 id(1)
    /// + 推荐行(1) + 推荐批量 terms(1)，与条目数无关；BFF 分组与空分区隐藏在 Product 侧。
    fn article_shelf(
        &self,
        query: &ArticleShelfQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleShelfData, OperationFailure> {
        let mut conn = self.connect()?;

        let type_rows = self.fetch_all(&mut conn.conn,
            "SELECT id AS id, name AS name, created_at AS created_at, updated_at AS updated_at FROM article_types ORDER BY name",
            &[], ctx)?;
        ctx.meter.record(1);
        let article_types: Vec<ArticleType> = type_rows
            .iter()
            .map(|row| {
                Ok(ArticleType {
                    id: column(row, "id")?,
                    name: column(row, "name")?,
                    created_at: column(row, "created_at")?,
                    updated_at: column(row, "updated_at")?,
                })
            })
            .collect::<Result<_, _>>()?;

        let filter = ArticleFilter {
            article_type_id: query.article_type_id,
            term_ids: query.term_ids.clone(),
            created_from: query.created_from.clone(),
            created_to: query.created_to.clone(),
            updated_from: query.updated_from.clone(),
            updated_to: query.updated_to.clone(),
        };
        let (where_sql, args) = build_article_where(true, &filter, None);

        let count_sql = format!("SELECT COUNT(*) AS total {ARTICLE_FROM}{where_sql}");
        let row = self
            .fetch_optional(&mut conn.conn, &count_sql, &args, ctx)?
            .ok_or_else(|| internal("count query returned no row", &"empty result"))?;
        let total: i64 = column(&row, "total")?;
        ctx.meter.record(1);

        // 完整筛选结果：排序与分页语义一致（BFF 需要全量以完成分区分组）。
        let rows_sql = format!(
            "SELECT {ARTICLE_COLUMNS} {ARTICLE_FROM}{where_sql} ORDER BY a.updated_at DESC, a.id DESC"
        );
        let rows = self.fetch_all(&mut conn.conn, &rows_sql, &args, ctx)?;
        ctx.meter.record(1);
        let mut articles: Vec<ArticleListItem> =
            rows.iter().map(article_item).collect::<Result<_, _>>()?;
        self.attach_relations(&mut conn.conn, &mut articles, ctx)?;

        let ids = self.recommendation_ids(ctx)?;
        let mut conn = self.connect()?;
        let mut recommendation = self.load_articles_ordered(&mut conn.conn, &ids, true, ctx)?;
        self.attach_relations(&mut conn.conn, &mut recommendation, ctx)?;

        Ok(ArticleShelfData {
            article_types,
            articles,
            total,
            recommendation,
        })
    }

    /// Mobile 平铺页浏览。
    ///
    /// 固定查询数 3~4：term kind 校验(0/1) + count(1) + 当前页(1) + 批量 terms(1)，
    /// 与条目数无关。筛选条件与列表排序语义一致（`updated_at DESC, id DESC`）。
    fn article_browse(
        &self,
        query: &ArticleBrowseQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleListPage, OperationFailure> {
        let page = normalize_page(query.page);
        let page_size = normalize_page_size(query.page_size);
        let mut conn = self.connect()?;

        // 0/1 参数校验：topic/tag 必须引用对应 kind 的 term（否则参数错误）。
        validate_browse_terms(self, &mut conn.conn, query, ctx)?;

        let (where_sql, args) = build_browse_where(true, query);

        // 1/3 count。
        let count_sql = format!("SELECT COUNT(*) AS total {ARTICLE_FROM}{where_sql}");
        let row = self
            .fetch_optional(&mut conn.conn, &count_sql, &args, ctx)?
            .ok_or_else(|| internal("count query returned no row", &"empty result"))?;
        let total: i64 = column(&row, "total")?;
        ctx.meter.record(1);
        if ctx.canceled() {
            return Err(OperationFailure::new(
                codes::CANCELED,
                "article_browse canceled before page read",
            ));
        }

        // 2/3 当前页。
        let page_sql = format!(
            "SELECT {ARTICLE_COLUMNS} {ARTICLE_FROM}{where_sql} \
             ORDER BY a.updated_at DESC, a.id DESC LIMIT ? OFFSET ?"
        );
        let mut page_args = args.clone();
        page_args.push(Bind::Int(i64::from(page_size)));
        page_args.push(Bind::Int(i64::from(page - 1) * i64::from(page_size)));
        let rows = self.fetch_all(&mut conn.conn, &page_sql, &page_args, ctx)?;
        ctx.meter.record(1);
        let mut items: Vec<ArticleListItem> =
            rows.iter().map(article_item).collect::<Result<_, _>>()?;
        if ctx.canceled() {
            return Err(OperationFailure::new(
                codes::CANCELED,
                "article_browse canceled before batch term read",
            ));
        }

        // 3/3 批量关联（类型名已在页查询里 JOIN 取回；`attach_relations` 自行计数）。
        self.attach_relations(&mut conn.conn, &mut items, ctx)?;

        Ok(ArticleListPage {
            items,
            page,
            page_size,
            total,
            has_more: has_more(page, page_size, total),
        })
    }

    fn describe(&self) -> Option<DatabaseDiagnostics> {
        Some(DatabaseDiagnostics {
            path: self.path.display().to_string(),
            applied_migrations: self.applied_migrations.clone(),
            seeded: self.seeded,
        })
    }

    /// 连接级释放是异步动作，见 [`SqliteStore::close`]。
    fn shutdown(&self) {}
}

/// `?, ?, ...` 占位符（参数顺序与 `Bind` 列表严格一致）。
fn placeholders_for(count: usize) -> String {
    vec!["?"; count].join(", ")
}

/// WHERE 子句构造（参数顺序与 `Bind` 列表严格一致）。
fn build_article_where(
    published_only: bool,
    filter: &ArticleFilter,
    search: Option<&str>,
) -> (String, Vec<Bind>) {
    let mut sql = String::from(" WHERE 1=1");
    let mut args: Vec<Bind> = Vec::new();
    if published_only {
        sql.push_str(" AND a.status = 'published'");
    }
    if let Some(type_id) = filter.article_type_id {
        sql.push_str(" AND a.article_type_id = ?");
        args.push(Bind::Int(type_id));
    }
    if let Some(from) = &filter.created_from {
        sql.push_str(" AND a.created_at >= ?");
        args.push(Bind::Text(from.clone()));
    }
    if let Some(to) = &filter.created_to {
        sql.push_str(" AND a.created_at < ?");
        args.push(Bind::Text(exclusive_date_end(to)));
    }
    if let Some(from) = &filter.updated_from {
        sql.push_str(" AND a.updated_at >= ?");
        args.push(Bind::Text(from.clone()));
    }
    if let Some(to) = &filter.updated_to {
        sql.push_str(" AND a.updated_at < ?");
        args.push(Bind::Text(exclusive_date_end(to)));
    }
    if !filter.term_ids.is_empty() {
        // 同一维度 OR：EXISTS + IN。
        let placeholders = placeholders_for(filter.term_ids.len());
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM article_terms at WHERE at.article_id = a.id AND at.term_id IN ({placeholders}))"
        ));
        for term_id in &filter.term_ids {
            args.push(Bind::Int(*term_id));
        }
    }
    if let Some(search) = search.map(str::trim).filter(|value| !value.is_empty()) {
        if search.chars().count() < 3 {
            let escaped = search
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_");
            sql.push_str(
                " AND (a.title LIKE ? ESCAPE '\\' OR a.summary LIKE ? ESCAPE '\\' OR a.content_html LIKE ? ESCAPE '\\')",
            );
            let value = format!("%{escaped}%");
            args.push(Bind::Text(value.clone()));
            args.push(Bind::Text(value.clone()));
            args.push(Bind::Text(value));
        } else {
            sql.push_str(
                " AND a.id IN (SELECT rowid FROM article_search_fts WHERE article_search_fts MATCH ?)",
            );
            args.push(Bind::Text(format!("\"{}\"", search.replace('"', "'"))));
        }
    }
    (sql, args)
}

/// 浏览的 WHERE 子构造：**每个维度一个独立子句**，
/// 维度之间 AND。
///
/// 刻意不走 [`build_article_where`] 的 `term_ids IN (...)`：那是同一维度 OR 语义，
/// 被 `public.article_list` / `admin.article_list` 与 Desktop 多选共用（决策记录 #7）。
/// topic / tag 各自用独立 EXISTS 表达，kind 条件一并写入子句（入口已校验 kind，
/// 这里再带一次只影响命中面，不改变错误语义）。
fn build_browse_where(published_only: bool, query: &ArticleBrowseQuery) -> (String, Vec<Bind>) {
    let mut sql = String::from(" WHERE 1=1");
    let mut args: Vec<Bind> = Vec::new();
    if published_only {
        sql.push_str(" AND a.status = 'published'");
    }
    if let Some(type_id) = query.article_type_id {
        sql.push_str(" AND a.article_type_id = ?");
        args.push(Bind::Int(type_id));
    }
    for (term_id, kind) in query.term_dimensions() {
        sql.push_str(
            " AND EXISTS (SELECT 1 FROM article_terms at JOIN terms t ON t.id = at.term_id \
             WHERE at.article_id = a.id AND at.term_id = ? AND t.kind = ?)",
        );
        args.push(Bind::Int(term_id));
        args.push(Bind::Text(kind.to_owned()));
    }
    (sql, args)
}

/// 浏览参数的 term `kind` 校验：`topic_id` / `tag_id` 必须引用对应 kind 的 term。
///
/// 一次 `IN` 查询取回全部相关 id 的 kind（没有维度参数时不发查询），不存在或
/// kind 不匹配都返回参数错误（错误码与消息由 Data 校验层统一）。
fn validate_browse_terms(
    store: &SqliteStore,
    conn: &mut SqliteConnection,
    query: &ArticleBrowseQuery,
    ctx: &OpCtx<'_>,
) -> Result<(), OperationFailure> {
    let wanted = query.term_dimensions();
    if wanted.is_empty() {
        return Ok(());
    }
    let placeholders = placeholders_for(wanted.len());
    let sql = format!("SELECT id AS id, kind AS kind FROM terms WHERE id IN ({placeholders})");
    let args: Vec<Bind> = wanted.iter().map(|(id, _)| Bind::Int(*id)).collect();
    let rows = store.fetch_all(conn, &sql, &args, ctx)?;
    ctx.meter.record(1);
    let kinds: HashMap<i64, String> = rows
        .iter()
        .map(|row| Ok((column(row, "id")?, column(row, "kind")?)))
        .collect::<Result<_, _>>()?;
    super::validation::browse_term_kind_failure(query, |term_id| {
        kinds.get(&term_id).map(String::as_str)
    })
    .map_or(Ok(()), Err)
}

/// 列读取：集中在此做类型与错误映射，保持查询代码可读。
fn column<'r, T, I>(row: &'r SqliteRow, index: I) -> Result<T, OperationFailure>
where
    T: Decode<'r, Sqlite> + Type<Sqlite>,
    I: ColumnIndex<SqliteRow>,
{
    row.try_get::<T, I>(index)
        .map_err(|error| internal("read column", &error))
}

fn internal(context: &str, error: &dyn std::fmt::Display) -> OperationFailure {
    OperationFailure::new(codes::INTERNAL_ERROR, format!("{context}: {error}"))
}

/// 启动期错误（连接 / 迁移 / seed）。
#[derive(Debug)]
pub struct OpenError(pub String);

impl std::fmt::Display for OpenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for OpenError {}

impl SqliteStore {
    /// Acquire the write lock with the conditional UPDATE, then read inside the same transaction.
    fn transition(
        &self,
        id: i64,
        publish: bool,
        expected_content: Option<&str>,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        let stamp = protocol::clock::now_utc_rfc3339();
        let mut tx = self.begin()?;
        let statement = if publish {
            if expected_content.is_some() {
                "UPDATE articles SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'draft' AND content_html = ?"
            } else {
                "UPDATE articles SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'"
            }
        } else {
            "UPDATE articles SET status = 'draft', published_at = NULL, updated_at = ? WHERE id = ? AND status = 'published'"
        };
        let mut args = if publish {
            vec![Bind::Text(stamp.clone()), Bind::Text(stamp), Bind::Int(id)]
        } else {
            vec![Bind::Text(stamp), Bind::Int(id)]
        };
        if publish {
            if let Some(expected) = expected_content {
                args.push(Bind::Text(expected.to_owned()));
            }
        }
        let result = self.execute(&mut tx.tx, statement, &args, ctx)?;
        ctx.meter.record(1);
        let detail = self.read_detail_in_tx(&mut tx.tx, id, ctx)?;
        if result.rows_affected() == 0 {
            if publish && detail.status == "draft" && expected_content.is_some() {
                return Err(OperationFailure::new(
                    codes::ARTICLE_CHANGED,
                    "article changed after inspection; retry publish",
                ));
            }
            return Err(OperationFailure::new(
                codes::INVALID_STATE_TRANSITION,
                format!("cannot transition article {id} from '{}'", detail.status),
            ));
        }
        self.block(async {
            tx.tx
                .commit()
                .await
                .map_err(|error| internal("commit transition", &error))
        })?;
        ctx.meter.record(1);
        Ok(detail)
    }

    fn update_article(
        &self,
        write: &ArticleWrite,
        draft_only: bool,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        let summary = normalize_summary(&write.summary)?;
        let stamp = protocol::clock::now_utc_rfc3339();
        let mut tx = self.begin()?;
        let update = if draft_only {
            "UPDATE articles SET title = ?, summary = ?, article_type_id = ?, content_html = ?, updated_at = ? WHERE id = ? AND status = 'draft'"
        } else {
            "UPDATE articles SET title = ?, summary = ?, article_type_id = ?, content_html = ?, updated_at = ? WHERE id = ?"
        };
        let result = self.execute(
            &mut tx.tx,
            update,
            &[
                Bind::Text(write.title.clone()),
                Bind::Text(summary),
                Bind::Int(write.article_type_id),
                Bind::Text(write.content_html.clone()),
                Bind::Text(stamp),
                Bind::Int(write.id),
            ],
            ctx,
        )?;
        ctx.meter.record(1);
        if result.rows_affected() == 0 {
            if draft_only {
                self.read_detail_in_tx(&mut tx.tx, write.id, ctx)?;
                return Err(OperationFailure::new(
                    codes::INVALID_STATE_TRANSITION,
                    "article must remain a draft",
                ));
            }
            return Err(not_found("article", write.id));
        }
        self.execute(
            &mut tx.tx,
            "DELETE FROM article_terms WHERE article_id = ?",
            &[Bind::Int(write.id)],
            ctx,
        )?;
        ctx.meter.record(1);
        self.write_term_links(&mut tx.tx, write.id, &write.term_ids, ctx)?;
        let detail = self.read_detail_in_tx(&mut tx.tx, write.id, ctx)?;
        self.block(async {
            tx.tx
                .commit()
                .await
                .map_err(|error| internal("commit article_update", &error))
        })?;
        ctx.meter.record(1);
        Ok(detail)
    }
}
