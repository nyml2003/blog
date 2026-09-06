//! 数据访问层：typed operations 的两个后端（`mock` 内存夹具 / `test` SQLite）。
//!
//! 分层边界（PLAN：同 runtime 内分层用 crate + trait 边界表达，不做层间消息通道）：
//! worker 线程只认识 [`DataStore`] trait 与 [`dispatch`]，不关心后端是 SQLite 还是夹具。
//! 两个后端的查询计数口径一致，使 N+1 诊断在 mock/test 下可比。

pub mod mock;
pub mod shared;
pub mod sqlite;
mod validation;

use std::sync::Arc;

use protocol::{
    ArticleBrowseQuery, ArticleDetail, ArticleGetQuery, ArticleId, ArticleListPage,
    ArticleListQuery, ArticleShelfData, ArticleShelfQuery, ArticleType, ArticleTypeListQuery,
    ArticleTypeName, ArticleTypeRef, ArticleTypeRename, ArticleWrite, DataOperation, DataOutcome,
    DatabaseDiagnostics, OperationFailure, Term, TermListQuery, TermRef, TermRename, TermWrite,
    Unit,
};

use crate::data_info;
use crate::executor::{CancelCheck, JobOutcome};
use crate::fixture;
use crate::semantics::{PersistentDb, Semantics, StorageLayout, TempDb};
use protocol::dates::exclusive_date_end;

/// 单次操作的执行上下文：预算、取消信号与查询计数。
pub struct OpCtx<'a> {
    pub budget: std::time::Duration,
    pub cancel: CancelCheck<'a>,
    pub meter: &'a Meter,
    pub started: std::time::Instant,
}

impl OpCtx<'_> {
    /// 剩余预算（deadline 沿链路传播；禁止外层短于内层的倒挂）。
    pub fn remaining(&self) -> std::time::Duration {
        self.budget.saturating_sub(self.started.elapsed())
    }

    pub fn canceled(&self) -> bool {
        self.cancel.is_canceled()
    }
}

/// 查询计数器：Data→SQLite（或 mock 的逻辑读取）固定查询数的证据来源。
#[derive(Debug, Default)]
pub struct Meter {
    count: std::cell::Cell<u32>,
}

impl Meter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&self, queries: u32) {
        self.count.set(self.count.get() + queries);
    }

    pub fn get(&self) -> u32 {
        self.count.get()
    }
}

/// 数据后端 trait：只暴露 typed operations，不暴露表 CRUD 或通用查询语言。
pub trait DataStore: Send + Sync + 'static {
    fn article_list(
        &self,
        query: &ArticleListQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleListPage, OperationFailure>;
    fn article_get(
        &self,
        query: &ArticleGetQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure>;
    fn article_type_list(
        &self,
        query: &ArticleTypeListQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleType>, OperationFailure>;
    fn term_list(
        &self,
        query: &TermListQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<Term>, OperationFailure>;
    // ---- 管理侧写入（一次 Data 请求内保持原子性，不做跨请求事务） ----

    /// 新建文章（草稿态）；时间字段与状态由 Data 维护。
    fn article_create(
        &self,
        write: &ArticleWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure>;
    /// 更新文章（不改状态，`updated_at` 前移，terms 全量替换）。
    fn article_update(
        &self,
        write: &ArticleWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure>;
    /// `draft -> published`。
    fn article_publish(
        &self,
        id: &ArticleId,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure>;
    fn article_update_draft(
        &self,
        write: &ArticleWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure>;
    fn article_publish_checked(
        &self,
        checked: &protocol::ArticlePublishChecked,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure>;
    /// `published -> draft`。
    fn article_unpublish(
        &self,
        id: &ArticleId,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure>;
    fn article_type_create(
        &self,
        name: &ArticleTypeName,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleType, OperationFailure>;
    fn article_type_update(
        &self,
        rename: &ArticleTypeRename,
        ctx: &OpCtx<'_>,
    ) -> Result<Unit, OperationFailure>;
    fn term_create(&self, write: &TermWrite, ctx: &OpCtx<'_>) -> Result<Term, OperationFailure>;
    fn term_update(&self, rename: &TermRename, ctx: &OpCtx<'_>) -> Result<Unit, OperationFailure>;
    /// 当前生效推荐集合：批量加载（禁止逐条 detail）。
    fn recommendation_current(
        &self,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleDetail>, OperationFailure>;
    /// 以最近更新的 6 篇已发布文章重建生效集合，返回重建后的集合。
    fn recommendation_generate(
        &self,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleDetail>, OperationFailure>;
    /// mobile shelf 读模型输入：类型 + 完整筛选结果 + 推荐（固定查询数）。
    fn article_shelf(
        &self,
        query: &ArticleShelfQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleShelfData, OperationFailure>;
    /// Mobile 平铺页浏览（SPEC-MOBILE-BROWSE-IA-001）：type/topic/tag 三维单选 AND
    /// + 分页，响应形态同 [`ArticleListPage`]。topic/tag 必须引用对应 `kind` 的 term。
    fn article_browse(
        &self,
        query: &ArticleBrowseQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleListPage, OperationFailure>;
    /// mock 语义无数据库对象，返回 `None`。
    fn describe(&self) -> Option<DatabaseDiagnostics>;
    /// 同步资源释放（连接级清理）；异步资源由 [`Store::shutdown`] 负责。
    fn shutdown(&self);
}

/// 把 typed operation 分派到 trait 方法；operations 集合封闭，新增能力在此登记。
pub fn dispatch(store: &dyn DataStore, operation: &DataOperation, ctx: &OpCtx<'_>) -> JobOutcome {
    match operation {
        DataOperation::ArticleList(query) => {
            store.article_list(query, ctx).map(DataOutcome::ArticleList)
        }
        DataOperation::ArticleGet(query) => store
            .article_get(query, ctx)
            .map(DataOutcome::ArticleDetail),
        DataOperation::ArticleTypeList(query) => store
            .article_type_list(query, ctx)
            .map(DataOutcome::ArticleTypes),
        DataOperation::TermList(query) => store.term_list(query, ctx).map(DataOutcome::Terms),
        DataOperation::DiagnosticEcho(query) => {
            Ok(DataOutcome::DiagnosticEcho(shared::diagnostic_echo(query)))
        }
        DataOperation::DiagnosticSlow(query) => {
            shared::diagnostic_slow(query, ctx).map(DataOutcome::DiagnosticSlow)
        }
        DataOperation::DiagnosticDigest(query) => Ok(DataOutcome::DiagnosticDigest(
            shared::diagnostic_digest(query),
        )),
        DataOperation::ArticleCreate(write) => store
            .article_create(write, ctx)
            .map(DataOutcome::ArticleDetail),
        DataOperation::ArticleUpdate(write) => store
            .article_update(write, ctx)
            .map(DataOutcome::ArticleDetail),
        DataOperation::ArticlePublish(id) => store
            .article_publish(id, ctx)
            .map(DataOutcome::ArticleDetail),
        DataOperation::ArticleUpdateDraft(write) => store
            .article_update_draft(write, ctx)
            .map(DataOutcome::ArticleDetail),
        DataOperation::ArticlePublishChecked(checked) => store
            .article_publish_checked(checked, ctx)
            .map(DataOutcome::ArticleDetail),
        DataOperation::ArticleUnpublish(id) => store
            .article_unpublish(id, ctx)
            .map(DataOutcome::ArticleDetail),
        DataOperation::ArticleTypeCreate(name) => store
            .article_type_create(name, ctx)
            .map(DataOutcome::ArticleType),
        DataOperation::ArticleTypeUpdate(rename) => store
            .article_type_update(rename, ctx)
            .map(DataOutcome::Unit),
        DataOperation::TermCreate(write) => store.term_create(write, ctx).map(DataOutcome::Term),
        DataOperation::TermUpdate(rename) => store.term_update(rename, ctx).map(DataOutcome::Unit),
        DataOperation::RecommendationCurrent => store
            .recommendation_current(ctx)
            .map(DataOutcome::Recommendation),
        DataOperation::RecommendationGenerate => store
            .recommendation_generate(ctx)
            .map(DataOutcome::Recommendation),
        DataOperation::ArticleShelf(query) => store
            .article_shelf(query, ctx)
            .map(DataOutcome::ArticleShelf),
        // 浏览与列表共用同一响应形态（wire 亦复用），operation 名已区分两者。
        DataOperation::ArticleBrowse(query) => store
            .article_browse(query, ctx)
            .map(DataOutcome::ArticleList),
    }
}

/// 共享的列表筛选语义：SQLite 后端据此生成同语义 SQL，`mock` 后端据此过滤夹具。
///
/// 同一维度 OR（`term_ids`），不同维度 AND；时间字段只读，客户端不可写。
#[derive(Debug, Default, Clone)]
pub(crate) struct ArticleFilter {
    pub article_type_id: Option<i64>,
    pub term_ids: Vec<i64>,
    pub created_from: Option<String>,
    pub created_to: Option<String>,
    pub updated_from: Option<String>,
    pub updated_to: Option<String>,
}

impl ArticleFilter {
    pub(crate) fn from_query(query: &ArticleListQuery) -> Self {
        Self {
            article_type_id: query.article_type_id,
            term_ids: query.term_ids.clone(),
            created_from: query.created_from.clone(),
            created_to: query.created_to.clone(),
            updated_from: query.updated_from.clone(),
            updated_to: query.updated_to.clone(),
        }
    }

    pub(crate) fn matches(&self, article: &impl FilterableArticle) -> bool {
        if let Some(type_id) = self.article_type_id {
            if article.article_type_id() != type_id {
                return false;
            }
        }
        // 同一维度 OR：任一 term 命中即可。
        if !self.term_ids.is_empty()
            && !self
                .term_ids
                .iter()
                .any(|id| article.term_ids().contains(id))
        {
            return false;
        }
        if let Some(from) = &self.created_from {
            if article.created_at() < from.as_str() {
                return false;
            }
        }
        if let Some(to) = &self.created_to {
            // 排他日终点：`YYYY-MM-DD` → 次日。
            if article.created_at() >= exclusive_date_end(to).as_str() {
                return false;
            }
        }
        if let Some(from) = &self.updated_from {
            if article.updated_at() < from.as_str() {
                return false;
            }
        }
        if let Some(to) = &self.updated_to {
            if article.updated_at() >= exclusive_date_end(to).as_str() {
                return false;
            }
        }
        true
    }
}

/// 让 SQLite 与 mock 两个后端共用同一套筛选语义（不同维度 AND，同一维度 OR）。
pub(crate) trait FilterableArticle {
    fn article_type_id(&self) -> i64;
    fn term_ids(&self) -> &[i64];
    fn created_at(&self) -> &str;
    fn updated_at(&self) -> &str;
}

impl FilterableArticle for fixture::FixtureArticle {
    fn article_type_id(&self) -> i64 {
        self.article_type_id
    }
    fn term_ids(&self) -> &[i64] {
        self.term_ids
    }
    fn created_at(&self) -> &str {
        self.created_at
    }
    fn updated_at(&self) -> &str {
        self.updated_at
    }
}

/// 类型/term 的只读映射，避免两个后端各写一份。
pub(crate) fn type_ref(type_id: i64) -> Option<ArticleTypeRef> {
    fixture::ARTICLE_TYPES
        .iter()
        .find(|candidate| candidate.id == type_id)
        .map(|candidate| ArticleTypeRef {
            id: candidate.id,
            name: candidate.name.to_owned(),
        })
}

pub(crate) fn term_refs(term_ids: &[i64]) -> Vec<TermRef> {
    fixture::TERMS
        .iter()
        .filter(|term| term_ids.contains(&term.id))
        .map(|term| TermRef {
            id: term.id,
            name: term.name.to_owned(),
            kind: term.kind.to_owned(),
        })
        .collect()
}

/// 启动期构建的数据后端；语义决定后端实现与存储布局。
pub struct Store {
    inner: Arc<dyn DataStore>,
    semantics: Semantics,
    sqlite: Option<Arc<sqlite::SqliteStore>>,
    layout: StorageLayout,
}

impl Store {
    /// `mock` 语义：纯内存夹具，不触碰任何 SQLite 文件。
    pub fn mock() -> Self {
        Self {
            inner: Arc::new(mock::MockStore::new()),
            semantics: Semantics::Mock,
            sqlite: None,
            layout: StorageLayout::None,
        }
    }

    /// `test` 语义：全新临时 SQLite + 自动迁移 + 稳定 seed。
    pub async fn open_test(temp: TempDb) -> Result<Self, String> {
        temp.prepare()
            .map_err(|error| format!("prepare test db dir {}: {error}", temp.path().display()))?;
        let mut store = sqlite::SqliteStore::open(temp.path())
            .await
            .map_err(|error| error.to_string())?;
        store.seed().await.map_err(|error| error.to_string())?;
        data_info!(
            "test db ready path={} migrations={} seeded=true",
            temp.path().display(),
            store.applied_migrations().len()
        );
        let sqlite = Arc::new(store);
        Ok(Self {
            inner: Arc::clone(&sqlite) as Arc<dyn DataStore>,
            semantics: Semantics::Test,
            sqlite: Some(Arc::clone(&sqlite)),
            layout: StorageLayout::TempFile(temp),
        })
    }

    /// `prod` 语义：仓库外持久 SQLite + 自动迁移，不加载 seed。
    pub async fn open_prod(db: PersistentDb) -> Result<Self, String> {
        db.prepare()
            .map_err(|error| format!("prepare prod db dir {}: {error}", db.path().display()))?;
        let store = sqlite::SqliteStore::open(db.path())
            .await
            .map_err(|error| error.to_string())?;
        data_info!(
            "prod db ready path={} migrations={} seeded=false",
            db.path().display(),
            store.applied_migrations().len()
        );
        let sqlite = Arc::new(store);
        Ok(Self {
            inner: Arc::clone(&sqlite) as Arc<dyn DataStore>,
            semantics: Semantics::Prod,
            sqlite: Some(Arc::clone(&sqlite)),
            layout: StorageLayout::PersistentFile(db),
        })
    }

    pub fn handle(&self) -> Arc<dyn DataStore> {
        Arc::clone(&self.inner)
    }

    pub fn semantics(&self) -> Semantics {
        self.semantics
    }

    pub fn describe(&self) -> Option<DatabaseDiagnostics> {
        self.inner.describe()
    }

    /// `mock` 语义恒为 `false`：用于启动日志与「未创建 SQLite 文件」的验收检查。
    pub fn uses_sqlite(&self) -> bool {
        self.sqlite.is_some()
    }

    /// 关停：释放连接资源（mock 语义为 no-op）。
    pub async fn shutdown(&self) {
        if let Some(sqlite) = &self.sqlite {
            sqlite.close().await;
        } else {
            self.inner.shutdown();
        }
    }

    /// 正常退出路径：删除 test 语义的临时库（含 WAL sidecar）。
    pub fn remove_storage(&self) {
        match &self.layout {
            StorageLayout::None => {}
            StorageLayout::TempFile(temp) => {
                let removed = temp.remove();
                data_info!(
                    "temp db removed path={} files={}",
                    temp.path().display(),
                    removed.len()
                );
            }
            StorageLayout::PersistentFile(db) => {
                data_info!("persistent db retained path={}", db.path().display());
            }
        }
    }
}
