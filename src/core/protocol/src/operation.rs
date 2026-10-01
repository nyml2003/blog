//! Data API 的 typed operations：请求、响应与执行 lane。
//!
//! 线上形态（内部协议，`snake_case`）：
//!
//! ```json
//! POST /data/v1/operations
//! { "operation": "article_list", "payload": { "page": 1, "page_size": 20 } }
//! ```
//!
//! 请求元数据（`X-Blog-Request-Id`、`X-Blog-Budget-Ms`）走 HTTP 头而非 body：
//! 这样 `DataOperation` 可以整体作为请求体，不需要 `serde(flatten)` 与 adjacent
//! tagged enum 组合（该组合在 serde 中不受支持）。

use serde::{Deserialize, Serialize};

/// 同步线程池的执行 lane。
///
/// 线程分工是**逻辑描述**而非绑核（PLAN：不做 `core_affinity` 物理绑核）：
/// - [`Lane::Io`]：数据访问与协议 I/O，8 线程、通道容量 64；
/// - [`Lane::Cpu`]：纯内存计算（本期为诊断用例，后续承接正文 HTML 校验等），1 线程、通道容量 4。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Lane {
    #[default]
    Io,
    Cpu,
}

impl Lane {
    /// 通道容量（有界通道；满则 `try_send` 失败并返回 503）。
    pub fn capacity(self) -> usize {
        match self {
            Lane::Io => 64,
            Lane::Cpu => 4,
        }
    }

    /// worker 线程数（I/O 8 + CPU 1）。
    pub fn threads(self) -> usize {
        match self {
            Lane::Io => 8,
            Lane::Cpu => 1,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Lane::Io => "io",
            Lane::Cpu => "cpu",
        }
    }
}

/// 文章列表读取条件。
///
/// 筛选语义沿用 ARCH-DATA-API：同一维度 OR（`term_ids`），不同维度 AND；
/// 默认排序 `updated_at DESC, id DESC`；`published_at`/时间字段由服务端维护。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct ArticleListQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub article_type_id: Option<i64>,
    /// 同一维度按 OR 匹配（任一 term 命中即可）。
    pub term_ids: Vec<i64>,
    /// `YYYY-MM-DD`，闭区间起点。
    pub created_from: Option<String>,
    /// `YYYY-MM-DD`，按日排他终点（Go 参考实现的 `exclusiveDateEnd` 语义）。
    pub created_to: Option<String>,
    pub updated_from: Option<String>,
    pub updated_to: Option<String>,
    /// `true` 时只返回 `status = 'published'`（公开可见性由 Data 保证）。
    pub published_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleGetQuery {
    pub id: i64,
    /// `true` 时草稿/已下线文章按不存在处理，不泄露管理状态。
    pub published_only: bool,
}

/// Mobile 平铺页的浏览查询。
///
/// 与 [`ArticleListQuery`] 的关键差异：topic / tag 是**独立维度**，各单选、维度间
/// AND，每维度使用独立的 EXISTS 子句。刻意**不**复用 `term_ids`（同一维度 OR 语义，
/// 被 `public.article_list` / `admin.article_list` 与 Desktop 多选共用，不得改语义）。
///
/// `topic_id` / `tag_id` 必须引用对应 `kind` 的 term；不匹配（或 term 不存在）按
/// 参数错误处理（`INVALID_PAYLOAD` → 对外 400）。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct ArticleBrowseQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    /// L1：文章类型（`全部` 时为 `None`）。
    pub article_type_id: Option<i64>,
    /// L2：主题 term；必须是 `kind = 'topic'`。
    pub topic_id: Option<i64>,
    /// L3：标签 term；必须是 `kind = 'tag'`。
    pub tag_id: Option<i64>,
    /// `true` 时只返回 `status = 'published'`（公开可见性由 Data 保证）。
    pub published_only: bool,
}

impl ArticleBrowseQuery {
    /// 请求提供的 term 维度（`topic_id` / `tag_id`，跳过未提供的维度）。
    ///
    /// SQL 生成（每维度一个独立 EXISTS 子句）与 kind 校验共用同一顺序。
    pub fn term_dimensions(&self) -> Vec<(i64, &'static str)> {
        let mut wanted: Vec<(i64, &'static str)> = Vec::new();
        if let Some(term_id) = self.topic_id {
            wanted.push((term_id, TERM_KIND_TOPIC));
        }
        if let Some(term_id) = self.tag_id {
            wanted.push((term_id, TERM_KIND_TAG));
        }
        wanted
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct ArticleTypeListQuery {
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct TermListQuery {
    /// `topic` / `tag`；`None` 表示不过滤。
    pub kind: Option<String>,
}

/// 诊断：回声，用于 Product→Data 链路与健康检查的最小用例。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct DiagnosticEcho {
    pub message: String,
}

/// 诊断：可取消的长循环。
///
/// 以 `batch_ms` 为批次时长执行 `batches` 个批次，并在**批次间隙**检查回程通道是否关闭；
/// 检测到取消即回到 `recv()`。用于复现协作式取消与通道背压（PLAN 验收 9）。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct DiagnosticSlow {
    pub batches: u32,
    pub batch_ms: u64,
}

/// 诊断：纯 CPU 计算（FNV-1a 多轮摘要），落在 `cpu` lane。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct DiagnosticDigest {
    pub input: String,
    pub rounds: u32,
}

/// 摘要上限：最多 160 个 Unicode 字符，空摘要合法（ARCH-DATA-API）。
pub const MAX_SUMMARY_CHARS: usize = 160;

/// 推荐集合读取上限：当前生效集合（MVP 规则为最近更新的 6 篇）。
pub const RECOMMENDATION_LIMIT: usize = 6;

/// term 的两种 `kind`（[`ArticleBrowseQuery`] 的 L2 / L3 维度，写入时同样只接受这两者）。
pub const TERM_KIND_TOPIC: &str = "topic";
pub const TERM_KIND_TAG: &str = "tag";

/// 文章写入（create / update 共用载荷）。
///
/// `summary` 由调用方保证 ≤ [`MAX_SUMMARY_CHARS`]；`status`/时间字段由 Data 维护，
/// 客户端不可写（ARCH-DATA-API）。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct ArticleWrite {
    /// update 时必填；create 时忽略。
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub article_type_id: i64,
    pub term_ids: Vec<i64>,
    pub content_html: String,
}

/// 单篇定位（publish / unpublish 共用）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleId {
    pub id: i64,
}

/// Product has inspected this exact source; Data compares it inside the transition.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArticlePublishChecked {
    pub id: i64,
    pub content_html: String,
}

/// 文章类型新增。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleTypeName {
    pub name: String,
}

/// 文章类型重命名。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleTypeRename {
    pub id: i64,
    pub name: String,
}

/// 主题/标签写入（create 用 `kind`，update 忽略）。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct TermWrite {
    pub id: i64,
    pub name: String,
    pub kind: String,
}

/// 主题/标签重命名。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TermRename {
    pub id: i64,
    pub name: String,
}

/// mobile shelf 读模型的输入条件（公开可见性恒成立，无需分页：BFF 需要完整筛选结果）。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", default)]
pub struct ArticleShelfQuery {
    pub article_type_id: Option<i64>,
    /// 同一维度 OR。
    pub term_ids: Vec<i64>,
    pub created_from: Option<String>,
    pub created_to: Option<String>,
    pub updated_from: Option<String>,
    pub updated_to: Option<String>,
}

/// Data API 的封闭操作集合。
///
/// 新增能力必须在此登记为具名 operation；不提供表 CRUD 或通用查询语言。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "operation", content = "payload", rename_all = "snake_case")]
pub enum DataOperation {
    /// 文章列表分页（含 count + 当前页 + 批量关联加载，固定查询数）。
    ArticleList(ArticleListQuery),
    /// Mobile 平铺页浏览：三维单选 AND + 分页，
    /// 响应形态与 [`DataOperation::ArticleList`] 相同（[`ArticleListPage`]）。
    ArticleBrowse(ArticleBrowseQuery),
    /// 单篇文章（含类型与 terms）。
    ArticleGet(ArticleGetQuery),
    /// 文章类型全量（按 `name` 排序）。
    ArticleTypeList(ArticleTypeListQuery),
    /// 主题/标签列表（可按 `kind` 过滤）。
    TermList(TermListQuery),
    /// 诊断：回声（`io` lane）。
    DiagnosticEcho(DiagnosticEcho),
    /// 诊断：可取消长循环（`io` lane）。
    DiagnosticSlow(DiagnosticSlow),
    /// 诊断：CPU 摘要（`cpu` lane）。
    DiagnosticDigest(DiagnosticDigest),
    /// 管理侧：新建文章（草稿态）。
    ArticleCreate(ArticleWrite),
    /// 管理侧：更新文章（不改状态，`updated_at` 前移）。
    ArticleUpdate(ArticleWrite),
    ArticleUpdateDraft(ArticleWrite),
    /// 管理侧：`draft -> published`。
    ArticlePublish(ArticleId),
    ArticlePublishChecked(ArticlePublishChecked),
    /// 管理侧：`published -> draft`。
    ArticleUnpublish(ArticleId),
    /// 管理侧：新增文章类型（名称唯一）。
    ArticleTypeCreate(ArticleTypeName),
    /// 管理侧：重命名文章类型。
    ArticleTypeUpdate(ArticleTypeRename),
    /// 管理侧：新增主题/标签。
    TermCreate(TermWrite),
    /// 管理侧：重命名主题/标签。
    TermUpdate(TermRename),
    /// 读取当前生效推荐集合（**批量**加载，不做逐条 detail）。
    RecommendationCurrent,
    /// 管理侧：以最近更新的 6 篇已发布文章重建生效集合。
    RecommendationGenerate,
    /// mobile shelf 读模型输入：类型 + 完整筛选结果 + 推荐（固定查询数）。
    ArticleShelf(ArticleShelfQuery),
    /// Replace the authoritative content cache and source commit in one transaction.
    ContentSnapshotReplace(crate::taxonomy::ContentSnapshotReplace),
    /// Read the last successfully imported content snapshot, if any.
    ContentSnapshotGet,
    /// Persist Product's complete workspace and pending-review state with optimistic concurrency.
    ContentWorkflowWrite(Box<crate::taxonomy::ContentWorkflowWrite>),
    /// Recover Product's complete workspace and pending-review state at startup.
    ContentWorkflowGet,
    /// 记录分享归因并清理过期明细。
    ShareAttributionRecord(ShareAttributionRecord),
}

impl DataOperation {
    /// 操作名（与 serde tag 一致），用于日志与诊断。
    pub fn name(&self) -> &'static str {
        match self {
            DataOperation::ArticleList(_) => "article_list",
            DataOperation::ArticleBrowse(_) => "article_browse",
            DataOperation::ArticleGet(_) => "article_get",
            DataOperation::ArticleTypeList(_) => "article_type_list",
            DataOperation::TermList(_) => "term_list",
            DataOperation::DiagnosticEcho(_) => "diagnostic_echo",
            DataOperation::DiagnosticSlow(_) => "diagnostic_slow",
            DataOperation::DiagnosticDigest(_) => "diagnostic_digest",
            DataOperation::ArticleCreate(_) => "article_create",
            DataOperation::ArticleUpdate(_) => "article_update",
            DataOperation::ArticleUpdateDraft(_) => "article_update_draft",
            DataOperation::ArticlePublish(_) => "article_publish",
            DataOperation::ArticlePublishChecked(_) => "article_publish_checked",
            DataOperation::ArticleUnpublish(_) => "article_unpublish",
            DataOperation::ArticleTypeCreate(_) => "article_type_create",
            DataOperation::ArticleTypeUpdate(_) => "article_type_update",
            DataOperation::TermCreate(_) => "term_create",
            DataOperation::TermUpdate(_) => "term_update",
            DataOperation::RecommendationCurrent => "recommendation_current",
            DataOperation::RecommendationGenerate => "recommendation_generate",
            DataOperation::ArticleShelf(_) => "article_shelf",
            DataOperation::ContentSnapshotReplace(_) => "content_snapshot_replace",
            DataOperation::ContentSnapshotGet => "content_snapshot_get",
            DataOperation::ContentWorkflowWrite(_) => "content_workflow_write",
            DataOperation::ContentWorkflowGet => "content_workflow_get",
            DataOperation::ShareAttributionRecord(_) => "share_attribution_record",
        }
    }

    /// 该操作应投递到的 lane。
    pub fn lane(&self) -> Lane {
        match self {
            DataOperation::DiagnosticDigest(_) => Lane::Cpu,
            _ => Lane::Io,
        }
    }

    /// 该操作是否只读；写操作在工作线程上不做取消短路（单次请求内保持原子性）。
    pub fn is_read(&self) -> bool {
        !matches!(
            self,
            DataOperation::ArticleCreate(_)
                | DataOperation::ArticleUpdate(_)
                | DataOperation::ArticleUpdateDraft(_)
                | DataOperation::ArticlePublish(_)
                | DataOperation::ArticlePublishChecked(_)
                | DataOperation::ArticleUnpublish(_)
                | DataOperation::ArticleTypeCreate(_)
                | DataOperation::ArticleTypeUpdate(_)
                | DataOperation::TermCreate(_)
                | DataOperation::TermUpdate(_)
                | DataOperation::RecommendationGenerate
                | DataOperation::ContentSnapshotReplace(_)
                | DataOperation::ContentWorkflowWrite(_)
                | DataOperation::ShareAttributionRecord(_)
        )
    }

    /// 语义上的结果条目数上界估计，用于「调用数与条目数无关」的日志对照。
    pub fn declared_item_budget(&self) -> usize {
        match self {
            DataOperation::ArticleList(q) => {
                q.page_size
                    .unwrap_or(crate::paging::DEFAULT_PAGE_SIZE)
                    .clamp(1, crate::paging::MAX_PAGE_SIZE) as usize
            }
            DataOperation::ArticleBrowse(q) => {
                q.page_size
                    .unwrap_or(crate::paging::DEFAULT_PAGE_SIZE)
                    .clamp(1, crate::paging::MAX_PAGE_SIZE) as usize
            }
            DataOperation::ArticleGet(_) => 1,
            DataOperation::ArticleTypeList(q) => q.limit.unwrap_or(u32::MAX) as usize,
            DataOperation::TermList(_) => usize::MAX,
            DataOperation::RecommendationCurrent | DataOperation::RecommendationGenerate => {
                RECOMMENDATION_LIMIT
            }
            DataOperation::ArticleShelf(_) => usize::MAX,
            DataOperation::ContentSnapshotGet
            | DataOperation::ContentSnapshotReplace(_)
            | DataOperation::ContentWorkflowGet
            | DataOperation::ContentWorkflowWrite(_) => 1,
            DataOperation::ShareAttributionRecord(_) => 1,
            _ => 0,
        }
    }
}

/// 封闭的 operation 名称集合（与 serde tag 一致），供 HTTP 层区分
/// `UNKNOWN_OPERATION` 与 `INVALID_PAYLOAD`。
pub const OPERATION_NAMES: &[&str] = &[
    "article_list",
    "article_browse",
    "article_get",
    "article_type_list",
    "term_list",
    "diagnostic_echo",
    "diagnostic_slow",
    "diagnostic_digest",
    "article_create",
    "article_update",
    "article_update_draft",
    "article_publish",
    "article_publish_checked",
    "article_unpublish",
    "article_type_create",
    "article_type_update",
    "term_create",
    "term_update",
    "recommendation_current",
    "recommendation_generate",
    "article_shelf",
    "content_snapshot_replace",
    "content_snapshot_get",
    "content_workflow_write",
    "content_workflow_get",
    "share_attribution_record",
];

/// 列表投影：列表调用不返回正文 HTML（ARCH-DATA-API mobile shelf 同一取舍）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleListItem {
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub article_type_id: i64,
    pub article_type: Option<ArticleTypeRef>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub published_at: Option<String>,
    pub term_ids: Vec<i64>,
    pub terms: Vec<TermRef>,
}

/// 详情：列表投影 + 正文 HTML。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleDetail {
    pub id: i64,
    pub title: String,
    pub summary: String,
    pub article_type_id: i64,
    pub article_type: Option<ArticleTypeRef>,
    pub content_html: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub published_at: Option<String>,
    pub term_ids: Vec<i64>,
    pub terms: Vec<TermRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleTypeRef {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TermRef {
    pub id: i64,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleType {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Term {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 列表响应：分页字段沿用 Go 参考实现的对外形态（snake_case 为内部协议）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleListPage {
    pub items: Vec<ArticleListItem>,
    pub page: u32,
    pub page_size: u32,
    pub total: i64,
    pub has_more: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DiagnosticEchoResult {
    pub message: String,
    pub byte_len: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DiagnosticSlowResult {
    pub batches_requested: u32,
    pub batches_completed: u32,
    pub batch_ms: u64,
    pub canceled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DiagnosticDigestResult {
    pub rounds: u32,
    pub input_len: usize,
    pub digest: String,
}

/// mobile shelf 读模型：一次操作带回 BFF 分组所需的全部输入（固定查询数）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ArticleShelfData {
    pub article_types: Vec<ArticleType>,
    /// 完整筛选结果（`updated_at DESC, id DESC`），不含正文 HTML。
    pub articles: Vec<ArticleListItem>,
    pub total: i64,
    /// 当前生效推荐（≤ [`RECOMMENDATION_LIMIT`]，只含已发布文章）。是否展示由 BFF 决定。
    pub recommendation: Vec<ArticleListItem>,
}

/// 分享访问归因明细；Product 只提交已校验的 token。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ShareAttributionRecord {
    pub token: String,
    pub article_id: i64,
    pub created_at_epoch: i64,
}

/// 无载荷成功（对应 Go 参考实现的 `data: null`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Unit;

/// typed operation 的成功载荷（失败走 envelope 失败码，不进 `data`）。
///
/// `#[allow(clippy::large_enum_variant)]`：列表页是唯一携带较多数据的变体，
/// 而 typed operations 的调用频率低、本地回环传输，装箱反而增加一次间接层。
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "outcome", content = "payload", rename_all = "snake_case")]
pub enum DataOutcome {
    ArticleList(ArticleListPage),
    ArticleDetail(ArticleDetail),
    ArticleTypes(Vec<ArticleType>),
    Terms(Vec<Term>),
    DiagnosticEcho(DiagnosticEchoResult),
    DiagnosticSlow(DiagnosticSlowResult),
    DiagnosticDigest(DiagnosticDigestResult),
    ArticleType(ArticleType),
    Term(Term),
    /// 无载荷（update 类操作）。
    Unit(Unit),
    /// 推荐集合：详情级投影（与 Go 参考实现的 `[]Article` 一致，含正文）。
    Recommendation(Vec<ArticleDetail>),
    /// mobile shelf 读模型输入。
    ArticleShelf(ArticleShelfData),
    ContentSnapshot(Option<crate::taxonomy::StoredContentSnapshot>),
    ContentWorkflow(Option<crate::taxonomy::StoredContentWorkflow>),
}

impl DataOutcome {
    /// 实际条目数，用于 Product 侧「调用数与条目数无关」的日志与验收记录。
    pub fn item_count(&self) -> usize {
        match self {
            DataOutcome::ArticleList(page) => page.items.len(),
            DataOutcome::ArticleDetail(_) => 1,
            DataOutcome::ArticleTypes(items) => items.len(),
            DataOutcome::Terms(items) => items.len(),
            DataOutcome::DiagnosticEcho(_) => 1,
            DataOutcome::DiagnosticSlow(_) => 1,
            DataOutcome::DiagnosticDigest(_) => 1,
            DataOutcome::ArticleType(_) | DataOutcome::Term(_) | DataOutcome::Unit(_) => 1,
            DataOutcome::Recommendation(items) => items.len(),
            DataOutcome::ArticleShelf(data) => data.articles.len(),
            DataOutcome::ContentSnapshot(snapshot) => usize::from(snapshot.is_some()),
            DataOutcome::ContentWorkflow(workflow) => usize::from(workflow.is_some()),
        }
    }
}
