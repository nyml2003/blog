//! 单个 session（或匿名空间）的内存数据与其上的 typed operations 语义。
//!
//! 领域规则对齐 `crates/data` 的 mock/test 后端（同一套 ARCH-DATA-API 语义）：
//!
//! - 公开读取隐含 `status = "published"`；draft 不泄露管理状态；
//! - 同一筛选维度 OR（`term_ids`），不同维度 AND；默认排序 `updated_at DESC, id DESC`；
//! - 状态机 `draft -> published -> draft`，非法迁移 `409 INVALID_STATE_TRANSITION`；
//! - 摘要 ≤ [`MAX_SUMMARY_CHARS`]（截断两侧空白），超出 `422 INVALID_SUMMARY`；
//! - 类型/term 名称唯一，冲突 `409 DUPLICATE_NAME`；时间字段由服务端维护。
//!
//! 与 Data 的差异是**有意的**：这里没有查询计数（Mock 不参与 N+1 验收），并且
//! 类型/term 的内联引用从**当前 session 的集合**解析，因此 admin 新建的类型/term
//! 会立即出现在已有文章的 `articleType`/`terms` 投影里（对前端更直观）。

use std::time::{Duration, Instant};

use protocol::envelope::codes;
use protocol::{
    ArticleBrowseQuery, ArticleDetail, ArticleGetQuery, ArticleId, ArticleListItem,
    ArticleListPage, ArticleListQuery, ArticleShelfData, ArticleShelfQuery, ArticleType,
    ArticleTypeListQuery, ArticleTypeName, ArticleTypeRef, ArticleTypeRename, ArticleWrite,
    MAX_SUMMARY_CHARS, OperationFailure, RECOMMENDATION_LIMIT, Term, TermListQuery, TermRef,
    TermRename, TermWrite, Unit, has_more, normalize_page, normalize_page_size,
};

use crate::scenario::SeedKind;
use crate::seed;
use protocol::clock::now_utc_rfc3339;
use protocol::dates::exclusive_date_end;

pub struct ContentArticleDraft {
    pub id: Option<i64>,
    pub title: String,
    pub summary: String,
    pub category_ids: Vec<i64>,
    pub tag_ids: Vec<i64>,
    pub content_html: String,
}

/// 一个 session 的全部状态；进程退出即丢弃（每次 runtime 启动重新初始化）。
pub struct DomainState {
    articles: Vec<ArticleDetail>,
    article_types: Vec<ArticleType>,
    terms: Vec<Term>,
    recommendation: Vec<i64>,
    next_article_id: i64,
    next_type_id: i64,
    next_term_id: i64,
    content_snapshot: protocol::ContentSnapshot,
    content_version: u64,
    pending_content: Option<protocol::ContentSnapshot>,
    content_pull_request: Option<u64>,
    last_used: Instant,
}

impl DomainState {
    /// 按种子形态初始化；`Full` = 完整夹具，`Empty` = 空世界。
    pub fn new(kind: SeedKind) -> Self {
        if kind == SeedKind::Empty {
            return Self {
                articles: Vec::new(),
                article_types: Vec::new(),
                terms: Vec::new(),
                recommendation: Vec::new(),
                next_article_id: 1,
                next_type_id: 1,
                next_term_id: 1,
                content_snapshot: protocol::ContentSnapshot::default(),
                content_version: 0,
                pending_content: None,
                content_pull_request: None,
                last_used: Instant::now(),
            };
        }
        Self {
            articles: seed::ARTICLES
                .iter()
                .map(|article| ArticleDetail {
                    id: article.id,
                    title: article.title.to_owned(),
                    summary: article.summary.to_owned(),
                    article_type_id: article.article_type_id,
                    article_type: None,
                    content_html: article.content_html.to_owned(),
                    status: article.status.to_owned(),
                    created_at: article.created_at.to_owned(),
                    updated_at: article.updated_at.to_owned(),
                    published_at: article.published_at.map(str::to_owned),
                    term_ids: article.term_ids.to_vec(),
                    terms: Vec::new(),
                })
                .collect(),
            article_types: seed::ARTICLE_TYPES
                .iter()
                .map(|kind| ArticleType {
                    id: kind.id,
                    name: kind.name.to_owned(),
                    created_at: seed::FIXTURE_STAMP.to_owned(),
                    updated_at: seed::FIXTURE_STAMP.to_owned(),
                })
                .collect(),
            terms: seed::TERMS
                .iter()
                .map(|term| Term {
                    id: term.id,
                    name: term.name.to_owned(),
                    kind: term.kind.to_owned(),
                    created_at: seed::FIXTURE_STAMP.to_owned(),
                    updated_at: seed::FIXTURE_STAMP.to_owned(),
                })
                .collect(),
            recommendation: seed::RECOMMENDATION_ARTICLE_IDS.to_vec(),
            next_article_id: seed::ARTICLES.iter().map(|a| a.id).max().unwrap_or(0) + 1,
            next_type_id: seed::ARTICLE_TYPES.iter().map(|t| t.id).max().unwrap_or(0) + 1,
            next_term_id: seed::TERMS.iter().map(|t| t.id).max().unwrap_or(0) + 1,
            content_snapshot: seeded_content_snapshot(),
            content_version: 0,
            pending_content: None,
            content_pull_request: None,
            last_used: Instant::now(),
        }
    }

    /// session 活跃度：由 [`crate::store::Store`] 在每次请求时调用。
    pub fn touch(&mut self) {
        self.last_used = Instant::now();
    }

    /// 距上次使用的时间（session 失效判定用）。
    pub fn idle_for(&self) -> Duration {
        self.last_used.elapsed()
    }

    pub fn article_count(&self) -> usize {
        self.articles.len()
    }

    pub fn content_workspace(&self) -> (u64, &protocol::ContentSnapshot, Option<u64>) {
        (
            self.content_version,
            &self.content_snapshot,
            self.content_pull_request,
        )
    }

    pub fn content_pending(&self) -> Option<&protocol::ContentSnapshot> {
        self.pending_content.as_ref()
    }

    pub fn content_save_article(
        &mut self,
        expected: u64,
        draft: ContentArticleDraft,
    ) -> Result<protocol::ContentSnapshotArticle, OperationFailure> {
        self.check_content_version(expected)?;
        let previous = draft.id.and_then(|id| {
            self.content_snapshot
                .articles
                .iter()
                .find(|article| article.meta.id == id)
                .cloned()
        });
        if draft.id.is_some() && previous.is_none() {
            return Err(OperationFailure::new(codes::NOT_FOUND, "article not found"));
        }
        if draft.title.trim().is_empty()
            || draft.summary.chars().count() > protocol::MAX_SUMMARY_CHARS
        {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "invalid article title or summary",
            ));
        }
        let id = draft.id.unwrap_or_else(|| {
            let next = self.next_article_id;
            self.next_article_id += 1;
            next
        });
        let stamp = protocol::clock::now_utc_rfc3339();
        let article = protocol::ContentSnapshotArticle {
            meta: protocol::ContentArticleMeta {
                id,
                title: draft.title,
                summary: draft.summary,
                category_ids: draft.category_ids,
                tag_ids: draft.tag_ids,
                created_at: previous
                    .as_ref()
                    .map(|value| value.meta.created_at.clone())
                    .unwrap_or_else(|| stamp.clone()),
                updated_at: stamp,
                published_at: previous.and_then(|value| value.meta.published_at),
            },
            content_html: draft.content_html,
        };
        self.content_snapshot
            .articles
            .retain(|value| value.meta.id != id);
        self.content_snapshot.articles.push(article.clone());
        self.content_snapshot
            .articles
            .sort_by_key(|value| value.meta.id);
        self.pending_content = None;
        self.content_version += 1;
        Ok(article)
    }

    pub fn content_remove_article(
        &mut self,
        expected: u64,
        id: i64,
    ) -> Result<(), OperationFailure> {
        self.check_content_version(expected)?;
        let before = self.content_snapshot.articles.len();
        self.content_snapshot
            .articles
            .retain(|value| value.meta.id != id);
        if before == self.content_snapshot.articles.len() {
            return Err(OperationFailure::new(codes::NOT_FOUND, "article not found"));
        }
        self.pending_content = None;
        self.content_version += 1;
        Ok(())
    }

    fn check_content_version(&self, expected: u64) -> Result<(), OperationFailure> {
        if self.content_version == expected {
            Ok(())
        } else {
            Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!(
                    "workspace version conflict: expected {expected}, actual {}",
                    self.content_version
                ),
            ))
        }
    }

    pub fn content_save_taxonomy(
        &mut self,
        expected: u64,
        taxonomy: protocol::Taxonomy,
    ) -> Result<(), OperationFailure> {
        if self.content_version != expected {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!(
                    "workspace version conflict: expected {expected}, actual {}",
                    self.content_version
                ),
            ));
        }
        self.content_snapshot.taxonomy = taxonomy;
        self.pending_content = None;
        self.content_version += 1;
        Ok(())
    }

    pub fn content_analyze(&mut self, expected: u64) -> Result<(), OperationFailure> {
        if self.content_version != expected {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "workspace version conflict",
            ));
        }
        self.pending_content = Some(self.content_snapshot.clone());
        Ok(())
    }

    pub fn content_review(&mut self, expected: u64) -> Result<(), OperationFailure> {
        if self.content_version != expected {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "workspace version conflict",
            ));
        }
        let Some(snapshot) = self.pending_content.take() else {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "no analyzed taxonomy changes are pending",
            ));
        };
        self.content_snapshot = snapshot;
        self.content_version += 1;
        Ok(())
    }

    pub fn content_submit(&mut self, expected: u64) -> Result<(), OperationFailure> {
        if self.content_version != expected {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "workspace version conflict",
            ));
        }
        if self.pending_content.is_some() {
            return Err(OperationFailure::new(
                codes::INVALID_STATE_TRANSITION,
                "taxonomy analysis must be reviewed before submit",
            ));
        }
        if self.content_pull_request.is_none() {
            self.content_pull_request = Some(1);
        }
        Ok(())
    }

    pub fn content_abandon(&mut self, expected: u64) -> Result<(), OperationFailure> {
        if self.content_version != expected {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "workspace version conflict",
            ));
        }
        self.pending_content = None;
        self.content_pull_request = None;
        self.content_version += 1;
        Ok(())
    }

    pub fn content_category_shelf(
        &self,
        selected: Option<i64>,
    ) -> Result<Vec<&protocol::ContentSnapshotArticle>, OperationFailure> {
        use std::collections::{BTreeSet, HashMap};
        let ids: BTreeSet<_> = self
            .content_snapshot
            .taxonomy
            .categories
            .iter()
            .map(|value| value.id)
            .collect();
        if selected.is_some_and(|id| !ids.contains(&id)) {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                "category_id does not exist",
            ));
        }
        let parents: HashMap<_, _> = self
            .content_snapshot
            .taxonomy
            .categories
            .iter()
            .map(|value| (value.id, value.parent_id))
            .collect();
        let parent_ids: BTreeSet<_> = parents.values().flatten().copied().collect();
        let leaves: BTreeSet<_> = ids
            .into_iter()
            .filter(|id| !parent_ids.contains(id))
            .filter(|leaf| {
                selected.is_none_or(|ancestor| {
                    let mut current = Some(*leaf);
                    while let Some(id) = current {
                        if id == ancestor {
                            return true;
                        }
                        current = parents.get(&id).copied().flatten();
                    }
                    false
                })
            })
            .collect();
        Ok(self
            .content_snapshot
            .articles
            .iter()
            .filter(|article| {
                article.meta.published_at.is_some()
                    && article
                        .meta
                        .category_ids
                        .iter()
                        .any(|id| leaves.contains(id))
            })
            .collect())
    }

    // ---------- 读取 ----------

    pub fn article_list(
        &self,
        query: &ArticleListQuery,
    ) -> Result<ArticleListPage, OperationFailure> {
        let page = normalize_page(query.page);
        let page_size = normalize_page_size(query.page_size);
        let mut matching: Vec<&ArticleDetail> = self
            .articles
            .iter()
            .filter(|article| {
                (!query.published_only || article.status == "published")
                    && matches_query(query, article)
            })
            .collect();
        matching.sort_by(|a, b| (&b.updated_at, b.id).cmp(&(&a.updated_at, a.id)));
        let total = matching.len() as i64;
        let offset = (page as usize - 1) * page_size as usize;
        let items: Vec<ArticleListItem> = matching
            .into_iter()
            .skip(offset)
            .take(page_size as usize)
            .map(|article| self.list_item(article))
            .collect();
        Ok(ArticleListPage {
            items,
            page,
            page_size,
            total,
            has_more: has_more(page, page_size, total),
        })
    }

    /// Mobile 平铺页浏览：type/topic/tag 三维单选 AND
    /// + 分页；`topic_id` / `tag_id` 必须引用对应 kind 的 term，否则参数错误。
    pub fn article_browse(
        &self,
        query: &ArticleBrowseQuery,
    ) -> Result<ArticleListPage, OperationFailure> {
        if let Some(failure) = browse_term_kind_failure(query, |term_id| {
            self.terms
                .iter()
                .find(|term| term.id == term_id)
                .map(|term| term.kind.as_str())
        }) {
            return Err(failure);
        }
        let page = normalize_page(query.page);
        let page_size = normalize_page_size(query.page_size);
        let mut matching: Vec<&ArticleDetail> = self
            .articles
            .iter()
            .filter(|article| {
                (!query.published_only || article.status == "published")
                    && matches_browse(query, &self.terms, article)
            })
            .collect();
        matching.sort_by(|a, b| (&b.updated_at, b.id).cmp(&(&a.updated_at, a.id)));
        let total = matching.len() as i64;
        let offset = (page as usize - 1) * page_size as usize;
        let items: Vec<ArticleListItem> = matching
            .into_iter()
            .skip(offset)
            .take(page_size as usize)
            .map(|article| self.list_item(article))
            .collect();
        Ok(ArticleListPage {
            items,
            page,
            page_size,
            total,
            has_more: has_more(page, page_size, total),
        })
    }

    pub fn article_get(&self, query: &ArticleGetQuery) -> Result<ArticleDetail, OperationFailure> {
        let article = self
            .articles
            .iter()
            .find(|article| {
                article.id == query.id && (!query.published_only || article.status == "published")
            })
            .ok_or_else(|| not_found("article", query.id))?;
        if query.published_only && !article_html_core::inspect(&article.content_html).valid {
            return Err(not_found("article", query.id));
        }
        Ok(self.resolved(article))
    }

    pub fn article_type_list(&self, query: &ArticleTypeListQuery) -> Vec<ArticleType> {
        let limit = query.limit.unwrap_or(u32::MAX) as usize;
        let mut types: Vec<&ArticleType> = self.article_types.iter().collect();
        types.sort_by_key(|kind| kind.name.clone());
        types.into_iter().take(limit).cloned().collect()
    }

    pub fn term_list(&self, query: &TermListQuery) -> Vec<Term> {
        self.terms
            .iter()
            .filter(|term| match &query.kind {
                Some(kind) => term.kind == kind.as_str(),
                None => true,
            })
            .cloned()
            .collect()
    }

    pub fn recommendation_current(&self) -> Vec<ArticleDetail> {
        let ids = self.recommendation.clone();
        self.details_ordered(&ids)
    }

    /// 以最近更新的 [`RECOMMENDATION_LIMIT`] 篇已发布文章重建生效集合（管理端「刷新」）。
    pub fn recommendation_generate(&mut self) -> Vec<ArticleDetail> {
        let mut published: Vec<&ArticleDetail> = self
            .articles
            .iter()
            .filter(|article| article.status == "published")
            .collect();
        published.sort_by(|a, b| (&b.updated_at, b.id).cmp(&(&a.updated_at, a.id)));
        let ids: Vec<i64> = published
            .into_iter()
            .take(RECOMMENDATION_LIMIT)
            .map(|article| article.id)
            .collect();
        self.recommendation = ids.clone();
        self.details_ordered(&ids)
    }

    /// mobile shelf 读模型：完整筛选结果 + 类型 + 推荐（无分页，BFF 需要全量）。
    pub fn article_shelf(&self, query: &ArticleShelfQuery) -> ArticleShelfData {
        let list_query = ArticleListQuery {
            search: None,
            page: Some(1),
            page_size: None,
            article_type_id: query.article_type_id,
            term_ids: query.term_ids.clone(),
            created_from: query.created_from.clone(),
            created_to: query.created_to.clone(),
            updated_from: query.updated_from.clone(),
            updated_to: query.updated_to.clone(),
            published_only: true,
        };
        let matching: Vec<&ArticleDetail> = self
            .articles
            .iter()
            .filter(|article| article.status == "published" && matches_query(&list_query, article))
            .collect();
        let total = matching.len() as i64;
        let articles: Vec<ArticleListItem> = matching
            .iter()
            .map(|article| self.list_item(article))
            .collect();
        let recommendation = self
            .recommendation_current()
            .iter()
            .map(|detail| self.list_item(detail))
            .collect();
        ArticleShelfData {
            article_types: self.article_type_list(&ArticleTypeListQuery::default()),
            articles,
            total,
            recommendation,
        }
    }

    // ---------- 管理写入 ----------

    pub fn article_create(
        &mut self,
        write: &ArticleWrite,
    ) -> Result<ArticleDetail, OperationFailure> {
        require_valid_html(&write.content_html)?;
        let summary = normalize_summary(&write.summary)?;
        let stamp = now_utc_rfc3339();
        let id = self.next_article_id;
        self.next_article_id += 1;
        let detail = ArticleDetail {
            id,
            title: write.title.clone(),
            summary,
            article_type_id: write.article_type_id,
            article_type: None,
            content_html: write.content_html.clone(),
            status: "draft".to_owned(),
            created_at: stamp.clone(),
            updated_at: stamp,
            published_at: None,
            term_ids: write.term_ids.clone(),
            terms: Vec::new(),
        };
        self.articles.push(detail.clone());
        Ok(self.resolved(&detail))
    }

    pub fn article_update(
        &mut self,
        write: &ArticleWrite,
    ) -> Result<ArticleDetail, OperationFailure> {
        require_valid_html(&write.content_html)?;
        let summary = normalize_summary(&write.summary)?;
        let stamp = now_utc_rfc3339();
        let article = self
            .articles
            .iter_mut()
            .find(|article| article.id == write.id)
            .ok_or_else(|| not_found("article", write.id))?;
        article.title = write.title.clone();
        article.summary = summary;
        article.article_type_id = write.article_type_id;
        article.content_html = write.content_html.clone();
        article.updated_at = stamp;
        article.term_ids = write.term_ids.clone();
        let updated = article.clone();
        Ok(self.resolved(&updated))
    }

    pub fn article_publish(&mut self, id: &ArticleId) -> Result<ArticleDetail, OperationFailure> {
        self.transition(id.id, true)
    }

    pub fn article_unpublish(&mut self, id: &ArticleId) -> Result<ArticleDetail, OperationFailure> {
        self.transition(id.id, false)
    }

    pub fn article_type_create(
        &mut self,
        name: &ArticleTypeName,
    ) -> Result<ArticleType, OperationFailure> {
        let trimmed = name.name.trim();
        if self.article_types.iter().any(|kind| kind.name == trimmed) {
            return Err(duplicate(format!(
                "article type '{trimmed}' already exists"
            )));
        }
        let id = self.next_type_id;
        self.next_type_id += 1;
        let kind = ArticleType {
            id,
            name: trimmed.to_owned(),
            created_at: now_utc_rfc3339(),
            updated_at: now_utc_rfc3339(),
        };
        self.article_types.push(kind.clone());
        Ok(kind)
    }

    pub fn article_type_update(
        &mut self,
        rename: &ArticleTypeRename,
    ) -> Result<Unit, OperationFailure> {
        let trimmed = rename.name.trim();
        if !self.article_types.iter().any(|kind| kind.id == rename.id) {
            return Err(not_found("article_type", rename.id));
        }
        if self
            .article_types
            .iter()
            .any(|kind| kind.id != rename.id && kind.name == trimmed)
        {
            return Err(duplicate(format!(
                "article type '{trimmed}' already exists"
            )));
        }
        let kind = self
            .article_types
            .iter_mut()
            .find(|kind| kind.id == rename.id)
            .expect("existence checked above");
        kind.name = trimmed.to_owned();
        kind.updated_at = now_utc_rfc3339();
        Ok(Unit)
    }

    pub fn term_create(&mut self, write: &TermWrite) -> Result<Term, OperationFailure> {
        let name = write.name.trim();
        let kind = write.kind.trim();
        if kind != "topic" && kind != "tag" {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!("term kind must be 'topic' or 'tag', got '{kind}'"),
            ));
        }
        if self
            .terms
            .iter()
            .any(|term| term.kind == kind && term.name == name)
        {
            return Err(duplicate(format!("{kind} '{name}' already exists")));
        }
        let id = self.next_term_id;
        self.next_term_id += 1;
        let term = Term {
            id,
            name: name.to_owned(),
            kind: kind.to_owned(),
            created_at: now_utc_rfc3339(),
            updated_at: now_utc_rfc3339(),
        };
        self.terms.push(term.clone());
        Ok(term)
    }

    pub fn term_update(&mut self, rename: &TermRename) -> Result<Unit, OperationFailure> {
        let trimmed = rename.name.trim();
        if !self.terms.iter().any(|term| term.id == rename.id) {
            return Err(not_found("term", rename.id));
        }
        if self
            .terms
            .iter()
            .any(|term| term.id != rename.id && term.name == trimmed)
        {
            return Err(duplicate(format!("term '{trimmed}' already exists")));
        }
        let term = self
            .terms
            .iter_mut()
            .find(|term| term.id == rename.id)
            .expect("existence checked above");
        term.name = trimmed.to_owned();
        term.updated_at = now_utc_rfc3339();
        Ok(Unit)
    }

    // ---------- 内部辅助 ----------

    fn transition(&mut self, id: i64, publish: bool) -> Result<ArticleDetail, OperationFailure> {
        let article = self
            .articles
            .iter_mut()
            .find(|candidate| candidate.id == id)
            .ok_or_else(|| not_found("article", id))?;
        let allowed = if publish {
            article.status == "draft"
        } else {
            article.status == "published"
        };
        if !allowed {
            return Err(OperationFailure::new(
                codes::INVALID_STATE_TRANSITION,
                format!(
                    "cannot transition article {id} from '{}' to '{}'",
                    article.status,
                    if publish { "published" } else { "draft" }
                ),
            ));
        }
        if publish {
            require_valid_html(&article.content_html)?;
        }
        let stamp = now_utc_rfc3339();
        article.updated_at = stamp.clone();
        article.published_at = if publish { Some(stamp) } else { None };
        article.status = if publish { "published" } else { "draft" }.to_owned();
        Ok(article.clone())
    }

    /// 列表/shelf 投影：不含正文 HTML（ARCH-DATA-API）。
    fn list_item(&self, article: &ArticleDetail) -> ArticleListItem {
        ArticleListItem {
            id: article.id,
            title: article.title.clone(),
            summary: article.summary.clone(),
            article_type_id: article.article_type_id,
            article_type: self.type_ref(article.article_type_id),
            status: article.status.clone(),
            created_at: article.created_at.clone(),
            updated_at: article.updated_at.clone(),
            published_at: article.published_at.clone(),
            term_ids: article.term_ids.clone(),
            terms: self.term_refs(&article.term_ids),
        }
    }

    /// 详情级投影，保持给定 id 顺序；只保留已发布文章（推荐集合的可见性规则）。
    fn details_ordered(&self, ids: &[i64]) -> Vec<ArticleDetail> {
        ids.iter()
            .filter_map(|id| {
                self.articles
                    .iter()
                    .find(|article| {
                        article.id == *id
                            && article.status == "published"
                            && article_html_core::inspect(&article.content_html).valid
                    })
                    .map(|article| self.resolved(article))
            })
            .collect()
    }

    /// 详情级投影：把 `article_type` / `terms` 从当前集合解析成内联引用。
    fn resolved(&self, article: &ArticleDetail) -> ArticleDetail {
        let mut detail = article.clone();
        detail.article_type = self.type_ref(detail.article_type_id);
        detail.terms = self.term_refs(&detail.term_ids);
        detail
    }

    fn type_ref(&self, type_id: i64) -> Option<ArticleTypeRef> {
        self.article_types
            .iter()
            .find(|kind| kind.id == type_id)
            .map(|kind| ArticleTypeRef {
                id: kind.id,
                name: kind.name.clone(),
            })
    }

    fn term_refs(&self, term_ids: &[i64]) -> Vec<TermRef> {
        term_ids
            .iter()
            .filter_map(|id| {
                self.terms
                    .iter()
                    .find(|term| term.id == *id)
                    .map(|term| TermRef {
                        id: term.id,
                        name: term.name.clone(),
                        kind: term.kind.clone(),
                    })
            })
            .collect()
    }
}

/// 列表筛选语义（与 Data 的 `ArticleFilter` 相同：不同维度 AND，同一维度 OR）。
fn matches_query(query: &ArticleListQuery, article: &ArticleDetail) -> bool {
    if let Some(type_id) = query.article_type_id {
        if article.article_type_id != type_id {
            return false;
        }
    }
    if !query.term_ids.is_empty()
        && !query
            .term_ids
            .iter()
            .any(|id| article.term_ids.contains(id))
    {
        return false;
    }
    if let Some(from) = &query.created_from {
        if article.created_at.as_str() < from.as_str() {
            return false;
        }
    }
    if let Some(to) = &query.created_to {
        if article.created_at.as_str() >= exclusive_date_end(to).as_str() {
            return false;
        }
    }
    if let Some(from) = &query.updated_from {
        if article.updated_at.as_str() < from.as_str() {
            return false;
        }
    }
    if let Some(to) = &query.updated_to {
        if article.updated_at.as_str() >= exclusive_date_end(to).as_str() {
            return false;
        }
    }
    true
}

/// 浏览筛选语义（与 Data 的 `build_browse_where` 相同）：type/topic/tag 三个独立
/// 维度，各单选、维度间 AND。`topic_id` / `tag_id` 的 kind 校验在入口完成。
fn matches_browse(query: &ArticleBrowseQuery, terms: &[Term], article: &ArticleDetail) -> bool {
    if let Some(type_id) = query.article_type_id {
        if article.article_type_id != type_id {
            return false;
        }
    }
    for (term_id, expected_kind) in query.term_dimensions() {
        let hit = term_kind_of(terms, term_id) == Some(expected_kind)
            && article.term_ids.contains(&term_id);
        if !hit {
            return false;
        }
    }
    true
}

/// 当前集合里某个 term 的 kind（不存在时为 `None`）。
fn term_kind_of(terms: &[Term], term_id: i64) -> Option<&str> {
    terms
        .iter()
        .find(|term| term.id == term_id)
        .map(|term| term.kind.as_str())
}

/// Mock Product validates against its session-local taxonomy, independently from Data.
fn browse_term_kind_failure<'a>(
    query: &ArticleBrowseQuery,
    kind_of: impl Fn(i64) -> Option<&'a str>,
) -> Option<OperationFailure> {
    for (term_id, expected_kind) in query.term_dimensions() {
        let failure = match kind_of(term_id) {
            None => OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!("{expected_kind} term {term_id} not found"),
            ),
            Some(kind) if kind != expected_kind => OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!("term {term_id} has kind '{kind}', expected '{expected_kind}'"),
            ),
            Some(_) => continue,
        };
        return Some(failure);
    }
    None
}

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

fn not_found(kind: &str, id: i64) -> OperationFailure {
    OperationFailure::new(codes::NOT_FOUND, format!("{kind} {id} not found"))
}

fn require_valid_html(source: &str) -> Result<(), OperationFailure> {
    let inspection = article_html_core::inspect(source);
    if inspection.valid {
        return Ok(());
    }
    let mut failure = OperationFailure::new(
        codes::INVALID_ARTICLE_HTML,
        "Article HTML does not satisfy article-html/v1",
    );
    failure.data = Some(serde_json::json!({ "htmlInspection": inspection }));
    Err(failure)
}

fn duplicate(message: String) -> OperationFailure {
    OperationFailure::new(codes::DUPLICATE_NAME, message)
}

fn seeded_content_snapshot() -> protocol::ContentSnapshot {
    let mut categories = Vec::new();
    for (index, kind) in seed::ARTICLE_TYPES.iter().enumerate() {
        categories.push(protocol::Category {
            id: kind.id,
            name: kind.name.to_owned(),
            parent_id: None,
            position: ((index + 1) * 10) as i32,
        });
        categories.push(protocol::Category {
            id: 1000 + kind.id,
            name: format!("{} articles", kind.name),
            parent_id: Some(kind.id),
            position: 10,
        });
        categories.push(protocol::Category {
            id: 2000 + kind.id,
            name: format!("{} notes", kind.name),
            parent_id: Some(kind.id),
            position: 20,
        });
    }
    let tags: Vec<_> = seed::TERMS
        .iter()
        .filter(|term| term.kind == protocol::TERM_KIND_TAG)
        .map(|term| protocol::Tag {
            id: term.id,
            name: term.name.to_owned(),
        })
        .collect();
    let articles = seed::ARTICLES
        .iter()
        .map(|article| protocol::ContentSnapshotArticle {
            meta: protocol::ContentArticleMeta {
                id: article.id,
                title: article.title.to_owned(),
                summary: article.summary.to_owned(),
                category_ids: if article.id == 11 {
                    vec![
                        1000 + article.article_type_id,
                        2000 + article.article_type_id,
                    ]
                } else {
                    vec![1000 + article.article_type_id]
                },
                tag_ids: article
                    .term_ids
                    .iter()
                    .copied()
                    .filter(|id| tags.iter().any(|tag| tag.id == *id))
                    .collect(),
                created_at: article.created_at.to_owned(),
                updated_at: article.updated_at.to_owned(),
                published_at: article.published_at.map(str::to_owned),
            },
            content_html: article.content_html.to_owned(),
        })
        .collect();
    protocol::ContentSnapshot {
        taxonomy: protocol::Taxonomy {
            version: 1,
            next_category_id: categories
                .iter()
                .map(|category| category.id)
                .max()
                .unwrap_or(0)
                + 1,
            next_tag_id: tags.iter().map(|tag| tag.id).max().unwrap_or(0) + 1,
            categories,
            tags,
        },
        articles,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full() -> DomainState {
        DomainState::new(SeedKind::Full)
    }

    fn empty() -> DomainState {
        DomainState::new(SeedKind::Empty)
    }

    fn write(title: &str) -> ArticleWrite {
        ArticleWrite {
            id: 0,
            title: title.to_owned(),
            summary: "created by a test".to_owned(),
            article_type_id: 1,
            term_ids: vec![1],
            content_html: "<p>created</p>".to_owned(),
        }
    }

    #[test]
    fn empty_seed_yields_valid_empty_collections() {
        let state = empty();
        let page = state
            .article_list(&ArticleListQuery {
                published_only: true,
                ..ArticleListQuery::default()
            })
            .unwrap();
        assert!(page.items.is_empty());
        assert_eq!(page.total, 0);
        assert!(!page.has_more);
        assert!(
            state
                .article_type_list(&ArticleTypeListQuery::default())
                .is_empty()
        );
        assert!(state.term_list(&TermListQuery::default()).is_empty());
        assert!(state.recommendation_current().is_empty());
        let shelf = state.article_shelf(&ArticleShelfQuery::default());
        assert!(shelf.articles.is_empty());
        assert!(shelf.article_types.is_empty());
        assert!(shelf.recommendation.is_empty());
        assert_eq!(shelf.total, 0);
    }

    #[test]
    fn full_seed_hides_drafts_from_public_reads() {
        let state = full();
        let public = state
            .article_list(&ArticleListQuery {
                published_only: true,
                ..ArticleListQuery::default()
            })
            .unwrap();
        assert_eq!(public.total, 45, "9 篇头部 + 36 篇追加");
        assert_eq!(public.items[0].id, 48, "updated_at DESC, id DESC");
        let everything = state
            .article_list(&ArticleListQuery {
                published_only: true,
                page_size: Some(100),
                ..ArticleListQuery::default()
            })
            .unwrap();
        assert_eq!(everything.items.len(), 45);
        assert_eq!(everything.items[44].id, 4, "排序末位 = 最早的头部文章");
        assert!(public.items.iter().all(|item| item.status == "published"));

        let admin = state.article_list(&ArticleListQuery::default()).unwrap();
        assert_eq!(admin.total, 48);

        let detail = state
            .article_get(&ArticleGetQuery {
                id: 3,
                published_only: true,
            })
            .unwrap_err();
        assert_eq!(detail.code, codes::NOT_FOUND, "draft is invisible publicly");
        let admin_detail = state
            .article_get(&ArticleGetQuery {
                id: 3,
                published_only: false,
            })
            .unwrap();
        assert_eq!(admin_detail.status, "draft");
    }

    #[test]
    fn create_then_publish_becomes_publicly_visible() {
        let mut state = full();
        let created = state.article_create(&write("Session local")).unwrap();
        assert_eq!(created.status, "draft");
        assert_eq!(created.id, 49, "next id continues the seed");

        let still_hidden = state
            .article_get(&ArticleGetQuery {
                id: created.id,
                published_only: true,
            })
            .unwrap_err();
        assert_eq!(still_hidden.code, codes::NOT_FOUND);

        let published = state
            .article_publish(&ArticleId { id: created.id })
            .unwrap();
        assert_eq!(published.status, "published");
        assert!(published.published_at.is_some());

        let page = state
            .article_list(&ArticleListQuery {
                published_only: true,
                ..ArticleListQuery::default()
            })
            .unwrap();
        assert_eq!(page.total, 46);
        assert_eq!(
            page.items[0].id, created.id,
            "newest updated_at sorts first"
        );

        let twice = state
            .article_publish(&ArticleId { id: created.id })
            .unwrap_err();
        assert_eq!(twice.code, codes::INVALID_STATE_TRANSITION);
    }

    #[test]
    fn update_moves_updated_at_and_replaces_terms() {
        let mut state = full();
        let updated = state
            .article_update(&ArticleWrite {
                id: 4,
                title: "日志前缀约定（已更新）".to_owned(),
                summary: "更新后的摘要".to_owned(),
                article_type_id: 2,
                term_ids: vec![3],
                content_html: "<p>updated</p>".to_owned(),
            })
            .unwrap();
        assert_eq!(updated.term_ids, vec![3]);
        assert_eq!(updated.terms.len(), 1);
        assert_eq!(updated.terms[0].name, "frontend");
        assert!(updated.updated_at.as_str() > "2026-08-28T12:00:00.000000000Z");
        assert!(
            state
                .article_update(&ArticleWrite {
                    id: 999,
                    ..write("x")
                })
                .is_err()
        );
    }

    #[test]
    fn domain_rules_match_the_data_backend() {
        let mut state = full();
        // 摘要上限：160 个 Unicode 字符（多字节按字符计）。
        let long = "字".repeat(MAX_SUMMARY_CHARS + 1);
        let mut overflow = write("overflow");
        overflow.summary = long;
        assert_eq!(
            state.article_create(&overflow).unwrap_err().code,
            codes::INVALID_SUMMARY
        );
        // 名称唯一冲突。
        assert_eq!(
            state
                .article_type_create(&ArticleTypeName {
                    name: "Engineering".to_owned()
                })
                .unwrap_err()
                .code,
            codes::DUPLICATE_NAME
        );
        // 非法 term kind。
        assert_eq!(
            state
                .term_create(&TermWrite {
                    id: 0,
                    name: "misc".to_owned(),
                    kind: "category".to_owned(),
                })
                .unwrap_err()
                .code,
            codes::INVALID_PAYLOAD
        );
        // 不存在的目标。
        assert_eq!(
            state
                .article_type_update(&ArticleTypeRename {
                    id: 999,
                    name: "X".to_owned()
                })
                .unwrap_err()
                .code,
            codes::NOT_FOUND
        );
    }

    #[test]
    fn admin_created_types_and_terms_resolve_into_refs() {
        let mut state = full();
        let kind = state
            .article_type_create(&ArticleTypeName {
                name: "Ops".to_owned(),
            })
            .unwrap();
        let term = state
            .term_create(&TermWrite {
                id: 0,
                name: "mock".to_owned(),
                kind: "tag".to_owned(),
            })
            .unwrap();
        let created = state
            .article_create(&ArticleWrite {
                article_type_id: kind.id,
                term_ids: vec![term.id],
                ..write("with new refs")
            })
            .unwrap();
        assert_eq!(created.article_type.as_ref().unwrap().name, "Ops");
        assert_eq!(created.terms[0].name, "mock");
    }

    #[test]
    fn recommendation_generate_rebuilds_from_the_latest_published() {
        let mut state = full();
        let current = state.recommendation_current();
        assert_eq!(current.len(), 6);
        assert_eq!(
            current.iter().map(|detail| detail.id).collect::<Vec<_>>(),
            vec![48, 47, 46, 45, 44, 43],
            "seed 推荐集合 = 最近更新的 6 篇"
        );

        // 下线一篇推荐内的文章后刷新：集合只保留已发布文章。
        state.article_unpublish(&ArticleId { id: 48 }).unwrap();
        let rebuilt = state.recommendation_generate();
        assert_eq!(rebuilt.len(), 6);
        assert!(rebuilt.iter().all(|detail| detail.status == "published"));
        assert!(!rebuilt.iter().any(|detail| detail.id == 48));
        assert_eq!(rebuilt[0].id, 47);
    }

    #[test]
    fn filters_are_or_within_a_dimension_and_and_across_dimensions() {
        let state = full();
        // 同一维度 OR：命中任一 term 即可（topic 1 命中 10 篇、topic 2 命中 8 篇，
        // 交集为空 → 并集 18；见 `seed::tests::distribution_matches_the_data_fixture`）。
        let either = state
            .article_list(&ArticleListQuery {
                published_only: true,
                term_ids: vec![1, 2],
                ..ArticleListQuery::default()
            })
            .unwrap();
        assert_eq!(either.total, 18, "terms 1 OR 2");
        // 不同维度 AND：term 1 + 类型 3 → 空。
        let both = state
            .article_list(&ArticleListQuery {
                published_only: true,
                article_type_id: Some(3),
                term_ids: vec![1],
                ..ArticleListQuery::default()
            })
            .unwrap();
        assert_eq!(both.total, 0);
        // 排他日终点：`updated_to=2026-08-28` 表示「08-28 全天」，只含 id 4。
        let day = state
            .article_list(&ArticleListQuery {
                published_only: true,
                updated_to: Some("2026-08-28".to_owned()),
                ..ArticleListQuery::default()
            })
            .unwrap();
        assert_eq!(day.total, 1);
        assert_eq!(day.items[0].id, 4);
    }

    #[test]
    fn pagination_is_normalized_and_reports_has_more() {
        let state = full();
        let page = state
            .article_list(&ArticleListQuery {
                published_only: true,
                page: Some(0),
                page_size: Some(4),
                ..ArticleListQuery::default()
            })
            .unwrap();
        assert_eq!(page.page, 1, "page < 1 normalizes to 1");
        assert_eq!(page.page_size, 4);
        assert!(page.has_more, "45 篇 / 每页 4 → 还有更多");
        let mid = state
            .article_list(&ArticleListQuery {
                published_only: true,
                page: Some(2),
                page_size: Some(4),
                ..ArticleListQuery::default()
            })
            .unwrap();
        assert_eq!(mid.items.len(), 4);
        let last = state
            .article_list(&ArticleListQuery {
                published_only: true,
                page: Some(12),
                page_size: Some(4),
                ..ArticleListQuery::default()
            })
            .unwrap();
        assert_eq!(last.items.len(), 1, "45 = 11 页 × 4 + 1");
        assert!(!last.has_more);
    }
}
