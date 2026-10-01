//! `mock` 语义后端：纯内存夹具，不创建、不打开任何 SQLite 文件。
//!
//! 与 SQLite 后端保持同一 typed operation 语义与同一查询计数口径
//! （list=3 / get=2 / type list=1 / term list=1 / recommendation=3 / shelf=7），
//! 使诊断指标在两个语义下可比。写操作同样生效（跨请求状态），但只存在于进程内存。

use std::collections::HashMap;
use std::sync::Mutex;

use protocol::envelope::codes;
use protocol::{
    ArticleBrowseQuery, ArticleDetail, ArticleGetQuery, ArticleId, ArticleListItem,
    ArticleListPage, ArticleListQuery, ArticleShelfData, ArticleShelfQuery, ArticleType,
    ArticleTypeListQuery, ArticleTypeName, ArticleTypeRename, ArticleWrite, DatabaseDiagnostics,
    MAX_SUMMARY_CHARS, OperationFailure, RECOMMENDATION_LIMIT, Term, TermListQuery, TermRef,
    TermRename, TermWrite, Unit, has_more, normalize_page, normalize_page_size,
};

use super::{ArticleFilter, DataStore, OpCtx};
use crate::fixture;

/// 一篇内存文章（字段与 SQLite 表一一对应）。
#[derive(Clone)]
struct MockArticle {
    id: i64,
    title: String,
    summary: String,
    article_type_id: i64,
    content_html: String,
    status: String,
    created_at: String,
    updated_at: String,
    published_at: Option<String>,
    term_ids: Vec<i64>,
}

#[derive(Clone)]
struct MockType {
    id: i64,
    name: String,
}

#[derive(Clone)]
struct MockTerm {
    id: i64,
    name: String,
    kind: String,
}

/// 进程内状态；写操作跨请求生效，进程退出即丢弃（`mock` 语义的定义）。
struct MockState {
    articles: Vec<MockArticle>,
    article_types: Vec<MockType>,
    terms: Vec<MockTerm>,
    recommendation: Vec<i64>,
    next_article_id: i64,
    next_type_id: i64,
    next_term_id: i64,
    content_snapshot: Option<protocol::StoredContentSnapshot>,
    content_workflow: Option<protocol::StoredContentWorkflow>,
    article_identities: HashMap<i64, (String, String)>,
}

impl MockState {
    fn from_fixture() -> Self {
        let articles: Vec<MockArticle> = fixture::ARTICLES
            .iter()
            .map(|article| MockArticle {
                id: article.id,
                title: article.title.to_owned(),
                summary: article.summary.to_owned(),
                article_type_id: article.article_type_id,
                content_html: article.content_html.to_owned(),
                status: article.status.to_owned(),
                created_at: article.created_at.to_owned(),
                updated_at: article.updated_at.to_owned(),
                published_at: article.published_at.map(str::to_owned),
                term_ids: article.term_ids.to_vec(),
            })
            .collect();
        let article_identities = articles
            .iter()
            .filter_map(|article| {
                article.published_at.as_ref().map(|published_at| {
                    (
                        article.id,
                        (article.created_at.clone(), published_at.clone()),
                    )
                })
            })
            .collect();
        Self {
            articles,
            article_types: fixture::ARTICLE_TYPES
                .iter()
                .map(|kind| MockType {
                    id: kind.id,
                    name: kind.name.to_owned(),
                })
                .collect(),
            terms: fixture::TERMS
                .iter()
                .map(|term| MockTerm {
                    id: term.id,
                    name: term.name.to_owned(),
                    kind: term.kind.to_owned(),
                })
                .collect(),
            recommendation: fixture::RECOMMENDATION_ARTICLE_IDS.to_vec(),
            next_article_id: fixture::ARTICLES.iter().map(|a| a.id).max().unwrap_or(0) + 1,
            next_type_id: fixture::ARTICLE_TYPES
                .iter()
                .map(|t| t.id)
                .max()
                .unwrap_or(0)
                + 1,
            next_term_id: fixture::TERMS.iter().map(|t| t.id).max().unwrap_or(0) + 1,
            content_snapshot: Some(protocol::StoredContentSnapshot {
                commit: "fixture-main".into(),
                snapshot: fixture::content_snapshot(),
            }),
            content_workflow: None,
            article_identities,
        }
    }
}

pub struct MockStore {
    state: Mutex<MockState>,
}

impl Default for MockStore {
    fn default() -> Self {
        Self::new()
    }
}

impl MockStore {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(MockState::from_fixture()),
        }
    }

    fn item(state: &MockState, article: &MockArticle) -> ArticleListItem {
        ArticleListItem {
            id: article.id,
            title: article.title.clone(),
            summary: article.summary.clone(),
            article_type_id: article.article_type_id,
            article_type: state
                .article_types
                .iter()
                .find(|candidate| candidate.id == article.article_type_id)
                .map(|candidate| protocol::ArticleTypeRef {
                    id: candidate.id,
                    name: candidate.name.clone(),
                }),
            status: article.status.clone(),
            created_at: article.created_at.clone(),
            updated_at: article.updated_at.clone(),
            published_at: article.published_at.clone(),
            term_ids: article.term_ids.clone(),
            terms: state
                .terms
                .iter()
                .filter(|term| article.term_ids.contains(&term.id))
                .map(|term| TermRef {
                    id: term.id,
                    name: term.name.clone(),
                    kind: term.kind.clone(),
                })
                .collect(),
        }
    }

    fn detail(state: &MockState, article: &MockArticle) -> ArticleDetail {
        let item = Self::item(state, article);
        ArticleDetail {
            content_html: article.content_html.clone(),
            id: item.id,
            title: item.title,
            summary: item.summary,
            article_type_id: item.article_type_id,
            article_type: item.article_type,
            status: item.status,
            created_at: item.created_at,
            updated_at: item.updated_at,
            published_at: item.published_at,
            term_ids: item.term_ids,
            terms: item.terms,
        }
    }

    /// 列表投影（可变访问）；调用方保证 meter 已计数。
    fn filtered(&self, state: &MockState, query: &ArticleListQuery) -> Vec<MockArticle> {
        let filter = ArticleFilter::from_query(query);
        let mut matching: Vec<MockArticle> = state
            .articles
            .iter()
            .filter(|article| {
                (!query.published_only || article.status == "published")
                    && filter.matches(*article)
                    && query.search.as_deref().is_none_or(|search| {
                        let search = search.trim().to_lowercase();
                        search.is_empty()
                            || article.title.to_lowercase().contains(&search)
                            || article.summary.to_lowercase().contains(&search)
                            || article.content_html.to_lowercase().contains(&search)
                    })
            })
            .cloned()
            .collect();
        matching.sort_by(|a, b| (&b.updated_at, b.id).cmp(&(&a.updated_at, a.id)));
        matching
    }

    /// 批量关联：一次逻辑读取覆盖整页 ID（对应 SQL 路径的 `IN (...)`）。
    fn batch_terms(&self, state: &MockState, article_ids: &[i64]) -> HashMap<i64, Vec<TermRef>> {
        let mut grouped: HashMap<i64, Vec<TermRef>> = HashMap::with_capacity(article_ids.len());
        for article in &state.articles {
            if article_ids.contains(&article.id) {
                grouped.insert(
                    article.id,
                    state
                        .terms
                        .iter()
                        .filter(|term| article.term_ids.contains(&term.id))
                        .map(|term| TermRef {
                            id: term.id,
                            name: term.name.clone(),
                            kind: term.kind.clone(),
                        })
                        .collect(),
                );
            }
        }
        grouped
    }

    /// 详情级投影，保持给定 id 顺序（推荐集合用，含正文 HTML）。
    fn details_ordered(&self, state: &MockState, ids: &[i64]) -> Vec<ArticleDetail> {
        let mut by_id: HashMap<i64, ArticleDetail> = HashMap::with_capacity(ids.len());
        for article in &state.articles {
            if ids.contains(&article.id) && article.status == "published" {
                by_id.insert(article.id, Self::detail(state, article));
            }
        }
        ids.iter().filter_map(|id| by_id.remove(id)).collect()
    }

    fn transition(
        &self,
        id: i64,
        publish: bool,
        expected_content: Option<&str>,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        let stamp = protocol::clock::now_utc_rfc3339();
        let mut state = self.state.lock().expect("mock state mutex");
        ctx.meter.record(1); // select 状态
        let article = {
            let article = state
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
            if expected_content.is_some_and(|expected| article.content_html != expected) {
                return Err(OperationFailure::new(
                    codes::ARTICLE_CHANGED,
                    "article changed after inspection; retry publish",
                ));
            }
            article.updated_at = stamp.clone();
            article.published_at = if publish { Some(stamp) } else { None };
            article.status = if publish { "published" } else { "draft" }.to_owned();
            article.clone()
        };
        ctx.meter.record(3); // update + 回读(2)
        Ok(Self::detail(&state, &article))
    }

    fn upsert_article(
        &self,
        write: &ArticleWrite,
        create: bool,
        draft_only: bool,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        let summary = normalize_summary(&write.summary);
        let stamp = protocol::clock::now_utc_rfc3339();
        let mut state = self.state.lock().expect("mock state mutex");
        let summary = summary?;
        let id;
        if create {
            ctx.meter.record(1); // insert
            id = state.next_article_id;
            state.next_article_id += 1;
            state.articles.push(MockArticle {
                id,
                title: write.title.clone(),
                summary,
                article_type_id: write.article_type_id,
                content_html: write.content_html.clone(),
                status: "draft".to_owned(),
                created_at: stamp.clone(),
                updated_at: stamp,
                published_at: None,
                term_ids: write.term_ids.clone(),
            });
            if !write.term_ids.is_empty() {
                ctx.meter.record(1); // 多值 terms
            }
            ctx.meter.record(1); // last_insert_rowid
        } else {
            id = write.id;
            ctx.meter.record(2); // update + delete terms
            let article = state
                .articles
                .iter_mut()
                .find(|candidate| candidate.id == write.id)
                .ok_or_else(|| not_found("article", write.id))?;
            if draft_only && article.status != "draft" {
                return Err(OperationFailure::new(
                    codes::INVALID_STATE_TRANSITION,
                    "article must remain a draft",
                ));
            }
            article.title = write.title.clone();
            article.summary = summary;
            article.article_type_id = write.article_type_id;
            article.content_html = write.content_html.clone();
            article.updated_at = stamp;
            article.term_ids = write.term_ids.clone();
        }
        ctx.meter.record(2); // 回读：行 + terms
        let detail = state
            .articles
            .iter()
            .find(|candidate| candidate.id == id)
            .map(|article| Self::detail(&state, article))
            .ok_or_else(|| not_found("article", id))?;
        ctx.meter.record(1); // commit
        Ok(detail)
    }
}

impl DataStore for MockStore {
    fn content_workflow_write(
        &self,
        request: &protocol::ContentWorkflowWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<protocol::StoredContentWorkflow, OperationFailure> {
        if let Some(failure) = super::validation::content_workflow_failure(&request.state) {
            return Err(failure);
        }
        let mut state = self.state.lock().expect("mock state poisoned");
        let current_revision = state.content_workflow.as_ref().map(|value| value.revision);
        if current_revision != request.expected_revision {
            return Err(OperationFailure::new(
                codes::CONTENT_WORKFLOW_CHANGED,
                format!(
                    "content workflow revision conflict: expected {:?}, actual {:?}",
                    request.expected_revision, current_revision
                ),
            ));
        }
        let stored = protocol::StoredContentWorkflow {
            revision: current_revision
                .unwrap_or(0)
                .checked_add(1)
                .ok_or_else(|| {
                    OperationFailure::new(
                        codes::CONTENT_WORKFLOW_CHANGED,
                        "content workflow revision space is exhausted",
                    )
                })?,
            state: request.state.clone(),
        };
        state.content_workflow = Some(stored.clone());
        ctx.meter.record(1);
        Ok(stored)
    }

    fn content_workflow_get(
        &self,
        ctx: &OpCtx<'_>,
    ) -> Result<Option<protocol::StoredContentWorkflow>, OperationFailure> {
        ctx.meter.record(1);
        Ok(self
            .state
            .lock()
            .expect("mock state poisoned")
            .content_workflow
            .clone())
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
        let mut state = self.state.lock().expect("mock state poisoned");
        let current_commit = state
            .content_snapshot
            .as_ref()
            .map(|snapshot| snapshot.commit.as_str());
        if current_commit != request.expected_previous_commit.as_deref() {
            return Err(OperationFailure::new(
                codes::CONTENT_SNAPSHOT_CHANGED,
                "content snapshot source commit changed before replacement",
            ));
        }
        if let Some(previous) = &state.content_snapshot {
            if previous.commit == request.commit {
                if previous.snapshot == request.snapshot {
                    return Ok(());
                }
                return Err(OperationFailure::new(
                    codes::CONTENT_WORKFLOW_CHANGED,
                    "the same source commit cannot identify a different snapshot",
                ));
            }
            if let Some(failure) =
                super::validation::content_history_failure(&previous.snapshot, &request.snapshot)
            {
                return Err(failure);
            }
        }
        for article in &projection.articles {
            if let Some((created_at, published_at)) = state.article_identities.get(&article.id) {
                if created_at != &article.created_at || published_at != &article.published_at {
                    return Err(OperationFailure::new(
                        codes::CONTENT_WORKFLOW_CHANGED,
                        format!(
                            "article {} identity or first publication time changed",
                            article.id
                        ),
                    ));
                }
            }
        }
        for article in &projection.articles {
            state
                .article_identities
                .entry(article.id)
                .or_insert_with(|| (article.created_at.clone(), article.published_at.clone()));
        }
        state.content_snapshot = Some(protocol::StoredContentSnapshot {
            commit: request.commit.clone(),
            snapshot: request.snapshot.clone(),
        });
        state.article_types = projection
            .types
            .into_iter()
            .map(|v| MockType {
                id: v.id,
                name: v.name,
            })
            .collect();
        state.terms = projection
            .terms
            .into_iter()
            .map(|v| MockTerm {
                id: v.id,
                name: v.name,
                kind: v.kind.to_owned(),
            })
            .collect();
        state.articles = projection
            .articles
            .into_iter()
            .map(|v| MockArticle {
                id: v.id,
                title: v.title,
                summary: v.summary,
                article_type_id: v.article_type_id,
                content_html: v.content_html,
                status: "published".to_owned(),
                created_at: v.created_at,
                updated_at: v.updated_at,
                published_at: Some(v.published_at),
                term_ids: v.term_ids,
            })
            .collect();
        let published = state
            .articles
            .iter()
            .map(|v| v.id)
            .collect::<std::collections::BTreeSet<_>>();
        state.recommendation.retain(|id| published.contains(id));
        state.next_article_id = state
            .articles
            .iter()
            .map(|v| v.id)
            .max()
            .unwrap_or(0)
            .saturating_add(1);
        state.next_type_id = state
            .article_types
            .iter()
            .map(|v| v.id)
            .max()
            .unwrap_or(0)
            .saturating_add(1);
        state.next_term_id = state
            .terms
            .iter()
            .map(|v| v.id)
            .max()
            .unwrap_or(0)
            .saturating_add(1);
        ctx.meter.record(1);
        Ok(())
    }

    fn content_snapshot_get(
        &self,
        ctx: &OpCtx<'_>,
    ) -> Result<Option<protocol::StoredContentSnapshot>, OperationFailure> {
        ctx.meter.record(1);
        Ok(self
            .state
            .lock()
            .expect("mock state poisoned")
            .content_snapshot
            .clone())
    }

    fn article_list(
        &self,
        query: &ArticleListQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleListPage, OperationFailure> {
        let page = normalize_page(query.page);
        let page_size = normalize_page_size(query.page_size);
        let state = self.state.lock().expect("mock state mutex");

        // 逻辑读取 1/3：count。
        let matching = self.filtered(&state, query);
        let total = matching.len() as i64;
        ctx.meter.record(1);
        if ctx.canceled() {
            return Err(canceled("article_list canceled before page read"));
        }

        // 逻辑读取 2/3：当前页（排序 `updated_at DESC, id DESC`）。
        let offset = (page as usize - 1) * page_size as usize;
        let mut items: Vec<ArticleListItem> = matching
            .into_iter()
            .skip(offset)
            .take(page_size as usize)
            .map(|article| Self::item(&state, &article))
            .collect();
        ctx.meter.record(1);
        if ctx.canceled() {
            return Err(canceled("article_list canceled before batch term read"));
        }

        // 逻辑读取 3/3：**批量**关联加载（固定一次，不按条目循环）。
        let ids: Vec<i64> = items.iter().map(|item| item.id).collect();
        let terms = self.batch_terms(&state, &ids);
        ctx.meter.record(1);
        for item in &mut items {
            let article_terms = terms.get(&item.id).cloned().unwrap_or_default();
            item.terms = article_terms;
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

    fn article_get(
        &self,
        query: &ArticleGetQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        let state = self.state.lock().expect("mock state mutex");
        let article = state
            .articles
            .iter()
            .find(|candidate| {
                candidate.id == query.id
                    && (!query.published_only || candidate.status == "published")
            })
            .ok_or_else(|| not_found("article", query.id))?;
        ctx.meter.record(1);
        if ctx.canceled() {
            return Err(canceled("article_get canceled before term read"));
        }
        ctx.meter.record(1);
        Ok(Self::detail(&state, article))
    }

    fn article_type_list(
        &self,
        query: &ArticleTypeListQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleType>, OperationFailure> {
        let limit = query.limit.unwrap_or(u32::MAX) as usize;
        let state = self.state.lock().expect("mock state mutex");
        let mut types: Vec<&MockType> = state.article_types.iter().collect();
        types.sort_by_key(|kind| kind.name.clone());
        ctx.meter.record(1);
        Ok(types
            .into_iter()
            .take(limit)
            .map(|kind| ArticleType {
                id: kind.id,
                name: kind.name.clone(),
                created_at: fixture::FIXTURE_STAMP.to_owned(),
                updated_at: fixture::FIXTURE_STAMP.to_owned(),
            })
            .collect())
    }

    fn term_list(
        &self,
        query: &TermListQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<Term>, OperationFailure> {
        let state = self.state.lock().expect("mock state mutex");
        ctx.meter.record(1);
        Ok(state
            .terms
            .iter()
            .filter(|term| match &query.kind {
                Some(kind) => term.kind == kind.as_str(),
                None => true,
            })
            .map(|term| Term {
                id: term.id,
                name: term.name.clone(),
                kind: term.kind.clone(),
                created_at: fixture::FIXTURE_STAMP.to_owned(),
                updated_at: fixture::FIXTURE_STAMP.to_owned(),
            })
            .collect())
    }

    fn article_create(
        &self,
        write: &ArticleWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        self.upsert_article(write, true, false, ctx)
    }

    fn article_update(
        &self,
        write: &ArticleWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        self.upsert_article(write, false, false, ctx)
    }

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

    fn article_update_draft(
        &self,
        write: &ArticleWrite,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        self.upsert_article(write, false, true, ctx)
    }

    fn article_publish_checked(
        &self,
        checked: &protocol::ArticlePublishChecked,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleDetail, OperationFailure> {
        self.transition(checked.id, true, Some(&checked.content_html), ctx)
    }

    fn article_type_create(
        &self,
        name: &ArticleTypeName,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleType, OperationFailure> {
        let trimmed = name.name.trim();
        let stamp = fixture::FIXTURE_STAMP.to_owned();
        let mut state = self.state.lock().expect("mock state mutex");
        ctx.meter.record(1);
        if state.article_types.iter().any(|kind| kind.name == trimmed) {
            return Err(duplicate(format!(
                "article type '{trimmed}' already exists"
            )));
        }
        let id = state.next_type_id;
        state.next_type_id += 1;
        state.article_types.push(MockType {
            id,
            name: trimmed.to_owned(),
        });
        Ok(ArticleType {
            id,
            name: trimmed.to_owned(),
            created_at: stamp.clone(),
            updated_at: stamp,
        })
    }

    fn article_type_update(
        &self,
        rename: &ArticleTypeRename,
        ctx: &OpCtx<'_>,
    ) -> Result<Unit, OperationFailure> {
        let trimmed = rename.name.trim();
        let mut state = self.state.lock().expect("mock state mutex");
        ctx.meter.record(1);
        if !state.article_types.iter().any(|kind| kind.id == rename.id) {
            return Err(not_found("article_type", rename.id));
        }
        if state
            .article_types
            .iter()
            .any(|kind| kind.id != rename.id && kind.name == trimmed)
        {
            return Err(duplicate(format!(
                "article type '{trimmed}' already exists"
            )));
        }
        let kind = state
            .article_types
            .iter_mut()
            .find(|kind| kind.id == rename.id)
            .expect("existence checked above");
        kind.name = trimmed.to_owned();
        Ok(Unit)
    }

    fn term_create(&self, write: &TermWrite, ctx: &OpCtx<'_>) -> Result<Term, OperationFailure> {
        let name = write.name.trim();
        let kind = write.kind.trim();
        if kind != "topic" && kind != "tag" {
            return Err(OperationFailure::new(
                codes::INVALID_PAYLOAD,
                format!("term kind must be 'topic' or 'tag', got '{kind}'"),
            ));
        }
        let stamp = fixture::FIXTURE_STAMP.to_owned();
        let mut state = self.state.lock().expect("mock state mutex");
        ctx.meter.record(1);
        if state
            .terms
            .iter()
            .any(|term| term.kind == kind && term.name == name)
        {
            return Err(duplicate(format!("{kind} '{name}' already exists")));
        }
        let id = state.next_term_id;
        state.next_term_id += 1;
        state.terms.push(MockTerm {
            id,
            name: name.to_owned(),
            kind: kind.to_owned(),
        });
        Ok(Term {
            id,
            name: name.to_owned(),
            kind: kind.to_owned(),
            created_at: stamp.clone(),
            updated_at: stamp,
        })
    }

    fn term_update(&self, rename: &TermRename, ctx: &OpCtx<'_>) -> Result<Unit, OperationFailure> {
        let trimmed = rename.name.trim();
        let mut state = self.state.lock().expect("mock state mutex");
        ctx.meter.record(1);
        if !state.terms.iter().any(|term| term.id == rename.id) {
            return Err(not_found("term", rename.id));
        }
        if state
            .terms
            .iter()
            .any(|candidate| candidate.id != rename.id && candidate.name == trimmed)
        {
            return Err(duplicate(format!("term '{trimmed}' already exists")));
        }
        let term = state
            .terms
            .iter_mut()
            .find(|term| term.id == rename.id)
            .expect("existence checked above");
        term.name = trimmed.to_owned();
        Ok(Unit)
    }

    /// 固定逻辑读取数 3：推荐 id(1) + 详情(1) + 批量 terms(1)。
    fn recommendation_current(
        &self,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleDetail>, OperationFailure> {
        let state = self.state.lock().expect("mock state mutex");
        let ids = state.recommendation.clone();
        ctx.meter.record(1);
        ctx.meter.record(2);
        Ok(self.details_ordered(&state, &ids))
    }

    /// 以最近更新的 [`RECOMMENDATION_LIMIT`] 篇已发布文章重建生效集合。
    fn recommendation_generate(
        &self,
        ctx: &OpCtx<'_>,
    ) -> Result<Vec<ArticleDetail>, OperationFailure> {
        let mut state = self.state.lock().expect("mock state mutex");
        ctx.meter.record(1);
        let mut published: Vec<&MockArticle> = state
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
        state.recommendation = ids.clone();
        // 与 SQLite 路径同一逻辑步骤：停用旧集合 + 新集合(2)、items(1)、回读行(1)、terms(1)、commit(1)。
        ctx.meter.record(2);
        ctx.meter.record(1);
        let details = self.details_ordered(&state, &ids);
        ctx.meter.record(3);
        Ok(details)
    }

    /// 固定逻辑读取数 7：types(1) + count(1) + 全量行(1) + 批量 terms(1) + 推荐 id(1) + 推荐行(1) + 推荐批量 terms(1)。
    fn article_shelf(
        &self,
        query: &ArticleShelfQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleShelfData, OperationFailure> {
        let state = self.state.lock().expect("mock state mutex");
        let mut types: Vec<&MockType> = state.article_types.iter().collect();
        types.sort_by_key(|kind| kind.name.clone());
        ctx.meter.record(1);

        let list_query = ArticleListQuery {
            search: None,
            page: Some(1),
            page_size: Some(u32::MAX),
            article_type_id: query.article_type_id,
            term_ids: query.term_ids.clone(),
            created_from: query.created_from.clone(),
            created_to: query.created_to.clone(),
            updated_from: query.updated_from.clone(),
            updated_to: query.updated_to.clone(),
            published_only: true,
        };
        let filter = ArticleFilter::from_query(&list_query);
        let matching: Vec<MockArticle> = state
            .articles
            .iter()
            .filter(|article| article.status == "published" && filter.matches(*article))
            .cloned()
            .collect();
        let total = matching.len() as i64;
        ctx.meter.record(2);
        let mut articles: Vec<ArticleListItem> = matching
            .iter()
            .map(|article| Self::item(&state, article))
            .collect();
        let ids: Vec<i64> = articles.iter().map(|item| item.id).collect();
        let terms = self.batch_terms(&state, &ids);
        ctx.meter.record(1);
        for item in &mut articles {
            let article_terms = terms.get(&item.id).cloned().unwrap_or_default();
            item.terms = article_terms;
            item.term_ids = item.terms.iter().map(|term| term.id).collect();
        }

        let rec_ids = state.recommendation.clone();
        // 逻辑读取：推荐 id(1) + 推荐行(1)。
        ctx.meter.record(2);
        let mut recommendation: Vec<ArticleListItem> = state
            .articles
            .iter()
            .filter(|article| rec_ids.contains(&article.id) && article.status == "published")
            .map(|article| Self::item(&state, article))
            .collect();
        // 逻辑读取：推荐批量 terms(1)。
        let rec_terms = self.batch_terms(&state, &rec_ids);
        ctx.meter.record(1);
        for item in &mut recommendation {
            let article_terms = rec_terms.get(&item.id).cloned().unwrap_or_default();
            item.terms = article_terms;
            item.term_ids = item.terms.iter().map(|term| term.id).collect();
        }
        // 保持推荐 position 顺序。
        recommendation.sort_by_key(|item| {
            rec_ids
                .iter()
                .position(|id| *id == item.id)
                .unwrap_or(usize::MAX)
        });

        Ok(ArticleShelfData {
            article_types: types
                .into_iter()
                .map(|kind| ArticleType {
                    id: kind.id,
                    name: kind.name.clone(),
                    created_at: fixture::FIXTURE_STAMP.to_owned(),
                    updated_at: fixture::FIXTURE_STAMP.to_owned(),
                })
                .collect(),
            articles,
            total,
            recommendation,
        })
    }

    /// Mobile 平铺页浏览。
    ///
    /// 逻辑读取数与 SQLite 路径同口径：term kind 校验(0/1) + count(1) + 当前页(1)
    /// + 批量 terms(1)，与条目数无关。
    fn article_browse(
        &self,
        query: &ArticleBrowseQuery,
        ctx: &OpCtx<'_>,
    ) -> Result<ArticleListPage, OperationFailure> {
        let page = normalize_page(query.page);
        let page_size = normalize_page_size(query.page_size);
        let state = self.state.lock().expect("mock state mutex");

        // 0/1 参数校验：topic/tag 必须引用对应 kind 的 term（无 term 维度参数时不计数）。
        if let Some(failure) = super::validation::browse_term_kind_failure(query, |term_id| {
            state
                .terms
                .iter()
                .find(|term| term.id == term_id)
                .map(|term| term.kind.as_str())
        }) {
            return Err(failure);
        }
        if !query.term_dimensions().is_empty() {
            ctx.meter.record(1);
        }

        // 1/3 count + 2/3 当前页（排序 `updated_at DESC, id DESC`）。
        let mut matching: Vec<&MockArticle> = state
            .articles
            .iter()
            .filter(|article| article.status == "published" && matches_browse(query, article))
            .collect();
        matching.sort_by(|a, b| (&b.updated_at, b.id).cmp(&(&a.updated_at, a.id)));
        let total = matching.len() as i64;
        ctx.meter.record(1);
        if ctx.canceled() {
            return Err(canceled("article_browse canceled before page read"));
        }
        let offset = (page as usize - 1) * page_size as usize;
        let mut items: Vec<ArticleListItem> = matching
            .into_iter()
            .skip(offset)
            .take(page_size as usize)
            .map(|article| Self::item(&state, article))
            .collect();
        ctx.meter.record(1);
        if ctx.canceled() {
            return Err(canceled("article_browse canceled before batch term read"));
        }

        // 3/3 批量关联加载。
        let ids: Vec<i64> = items.iter().map(|item| item.id).collect();
        let terms = self.batch_terms(&state, &ids);
        ctx.meter.record(1);
        for item in &mut items {
            let article_terms = terms.get(&item.id).cloned().unwrap_or_default();
            item.terms = article_terms;
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

    fn describe(&self) -> Option<DatabaseDiagnostics> {
        // mock 语义没有数据库对象；诊断里不出现 database 字段（序列化为 null）。
        None
    }

    fn shutdown(&self) {}
}

/// 浏览筛选语义（与 SQLite 的 `build_browse_where` 相同）：每个维度独立子句，
/// 维度之间 AND；`topic_id` / `tag_id` 的 kind 校验在入口完成。
fn matches_browse(query: &ArticleBrowseQuery, article: &MockArticle) -> bool {
    if let Some(type_id) = query.article_type_id {
        if article.article_type_id != type_id {
            return false;
        }
    }
    for (term_id, expected_kind) in query.term_dimensions() {
        let hit = fixture::TERMS.iter().any(|term| {
            term.id == term_id && term.kind == expected_kind && article.term_ids.contains(&term.id)
        });
        if !hit {
            return false;
        }
    }
    true
}

use super::FilterableArticle;

impl FilterableArticle for MockArticle {
    fn article_type_id(&self) -> i64 {
        self.article_type_id
    }
    fn term_ids(&self) -> &[i64] {
        &self.term_ids
    }
    fn created_at(&self) -> &str {
        &self.created_at
    }
    fn updated_at(&self) -> &str {
        &self.updated_at
    }
}

fn canceled(message: &str) -> OperationFailure {
    OperationFailure::new(codes::CANCELED, message)
}

fn not_found(kind: &str, id: i64) -> OperationFailure {
    OperationFailure::new(codes::NOT_FOUND, format!("{kind} {id} not found"))
}

fn duplicate(message: String) -> OperationFailure {
    OperationFailure::new(codes::DUPLICATE_NAME, message)
}

/// 摘要领域规则（与 SQLite 路径同一实现，写入前调用）。
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_state_preserves_published_count() {
        let state = MockState::from_fixture();
        assert_eq!(state.articles.len(), 48, "12 篇头部 + 36 篇追加");
        assert_eq!(
            state
                .articles
                .iter()
                .filter(|article| article.status == "published")
                .count(),
            45
        );
        assert_eq!(state.recommendation.len(), RECOMMENDATION_LIMIT);
        assert_eq!(
            state.recommendation,
            vec![48, 47, 46, 45, 44, 43],
            "推荐集合 = 最近更新的 6 篇"
        );
    }

    #[test]
    fn summary_rule_trims_and_rejects_overflow() {
        assert_eq!(normalize_summary("  hi  ").unwrap(), "hi");
        assert_eq!(normalize_summary("").unwrap(), "");
        let long = "字".repeat(MAX_SUMMARY_CHARS + 1);
        assert_eq!(
            normalize_summary(&long).unwrap_err().code,
            codes::INVALID_SUMMARY
        );
        let exact = "字".repeat(MAX_SUMMARY_CHARS);
        assert_eq!(
            normalize_summary(&exact).unwrap().chars().count(),
            MAX_SUMMARY_CHARS
        );
    }

    /// 浏览筛选语义：每个 term 维度独立成立，维度间 AND。
    #[test]
    fn browse_filters_are_and_across_dimensions() {
        let state = MockState::from_fixture();
        // seed: 11 → terms [1(topic), 4(tag)]；term 3 是 tag。
        let article = state.articles.iter().find(|a| a.id == 11).unwrap();
        let matches = |topic_id: Option<i64>, tag_id: Option<i64>, type_id: Option<i64>| {
            matches_browse(
                &ArticleBrowseQuery {
                    article_type_id: type_id,
                    topic_id,
                    tag_id,
                    published_only: true,
                    ..ArticleBrowseQuery::default()
                },
                article,
            )
        };
        assert!(matches(None, None, None), "无筛选全命中");
        assert!(matches(Some(1), None, None), "单维 topic 命中");
        assert!(
            !matches(Some(3), None, None),
            "topic 维度收到 tag id 不命中"
        );
        assert!(
            !matches(None, Some(1), None),
            "tag 维度收到 topic id 不命中"
        );
        assert!(
            !matches(Some(1), Some(3), None),
            "11 无 term 3 → AND 不成立"
        );
        assert!(!matches(None, None, Some(2)), "类型不匹配");
        assert!(matches(None, Some(4), Some(1)), "tag 4 + 类型 1 命中");
    }
}
