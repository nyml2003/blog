//! `protocol`：Rust Product 与 Data Server 之间的层间类型。
//!
//! 职责边界（对齐 `PLAN-OPS-RUNTIME-DEV-001` / `WORKSTREAM-OPS-RUNTIME-BACKEND`）：
//!
//! - Data API 是**按领域定义的 typed operations**，不是表 CRUD，也不是通用查询语言；
//!   因此本 crate 只暴露具名请求/响应结构体与一个封闭的 `DataOperation` 枚举。
//! - 内部协议统一使用 `snake_case` 字段（[`operation`]），对外 HTTP 契约用 camelCase
//!   （[`wire`]）；两套命名刻意不同，使内部字段名不会泄漏到公开 API。
//! - 响应统一使用 ARCH-DATA-API 的 `{ code, message, data }` envelope（[`envelope`]）。
//! - 诊断 schema 的雏形见 [`diagnostics`]：lane 深度、查询计数与单次操作诊断，
//!   用于证明「Product→Data 调用数、Data→SQLite 查询数与结果条目数无关」。
//! - Product 与 Mock 共用的服务端实现细节也在此：
//!   [`wire`]（对外 envelope + camelCase 投影 + `sceneCode`/错误码常量见 [`scene`]）、
//!   [`clock`]（服务端时间字段）与 [`dates`]（日期过滤排他终点）。
//!   三者只依赖 `std` + `serde`，遵守「protocol 零运行时依赖」约束。
//!
//! 本 crate 不依赖任何运行时（tokio/axum/sqlx），只做数据描述，保证层间类型可以
//! 被两侧以及后续的 Mock Product API 复用而不引入编译依赖。

pub mod clock;
pub mod dates;
pub mod diagnostics;
pub mod envelope;
pub mod operation;
pub mod paging;
pub mod scene;
pub mod site_routes;
pub mod taxonomy;
pub mod wire;

pub use diagnostics::{
    DataRuntimeDiagnostics, DatabaseDiagnostics, LaneDiagnostics, OperationDiag,
};
pub use envelope::{Envelope, OperationFailure};
pub use operation::{
    ArticleBrowseQuery, ArticleDetail, ArticleGetQuery, ArticleId, ArticleListItem,
    ArticleListPage, ArticleListQuery, ArticlePublishChecked, ArticleShelfData, ArticleShelfQuery,
    ArticleType, ArticleTypeListQuery, ArticleTypeName, ArticleTypeRef, ArticleTypeRename,
    ArticleWrite, DataOperation, DataOutcome, DiagnosticDigest, DiagnosticDigestResult,
    DiagnosticEcho, DiagnosticEchoResult, DiagnosticSlow, DiagnosticSlowResult, Lane,
    MAX_SUMMARY_CHARS, OPERATION_NAMES, RECOMMENDATION_LIMIT, ShareAttributionRecord,
    TERM_KIND_TAG, TERM_KIND_TOPIC, Term, TermListQuery, TermRef, TermRename, TermWrite, Unit,
};
pub use paging::{has_more, normalize_page, normalize_page_size};
pub use taxonomy::{
    Category, ContentArticle as ContentSnapshotArticle, ContentArticleMeta, ContentRemoteBatch,
    ContentRemoteOperation, ContentRemoteOperationKind, ContentSnapshot, ContentSnapshotReplace,
    ContentSyncState, ContentWorkflowState, ContentWorkflowWrite, ContentWorkspaceStatus,
    PendingTaxonomyReview, StoredContentSnapshot, StoredContentWorkflow, TAXONOMY_SCHEMA_VERSION,
    Tag, Taxonomy,
};
