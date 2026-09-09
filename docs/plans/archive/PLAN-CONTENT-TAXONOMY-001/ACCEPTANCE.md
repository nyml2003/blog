---
kind: acceptance
id: ACCEPTANCE-CONTENT-TAXONOMY-001
plan_id: PLAN-CONTENT-TAXONOMY-001
status: pending
owner: user
last_reviewed: 2026-09-08
---

# 内容分类树与 GitHub PR 工作流验收清单

代码、自动化门禁、真实 GitHub 工作流和浏览器证据已经完成。以下自动化项目由已有
证据确认；用户 review 与最终产品确认保持待办，完成前计划维持 acceptance，不归档。

## 自动化与真实集成

- [x] taxonomy schema、分类/标签独立 ID 水位、叶子引用、无环和整批引用完整性有自动化覆盖；
- [x] 模型生成、后端 ID 分配与规范化、一次复核及提交前 publishable 校验有自动化覆盖；
- [x] 真实私有仓库 `nyml2003/blog-content-e2e` 完成首次提交、同 PR 更新、merge 后同步和下一批恢复；
- [x] [PR #1](https://github.com/nyml2003/blog-content-e2e/pull/1) 已 merge，merge commit 为 `b51129f0aaff802b75ef0d5c738721d5d9c1068b`；
- [x] PR #2 保持 open，head 为 `32c6d2f9142e682e27a7e94cbb8e7aa3c7422398`；
- [x] merge 后工作区版本为 6，post-submit article 2 保留在下一批；
- [x] 公开快照只有 article 1，未合入的 article 2 没有出现在公开 API 或页面；
- [x] 浏览器报告通过，四张截图覆盖登录、内容工作区、Desktop 公开文章和 Mobile 公开文章；
- [x] Mobile 两个 F 型入口的一级/二级切换、父级汇总去重和返回恢复由
  [页面计划浏览器证据](../PLAN-FRONTEND-PAGE-TEMPLATE-001/evidence/README.md) 覆盖；
- [x] 全量 runtime gate 13/13 通过，ops 契约测试总计 108 项且无失败。

## 用户确认

- [ ] 审查 [PR #2](https://github.com/nyml2003/blog-content-e2e/pull/2) 的 taxonomy、article meta 和正文 diff；
- [ ] 确认管理工作区显示的版本 6、active PR #2 和下一批内容符合预期；
- [ ] 抽查 Desktop 与 Mobile 公开端只显示 article 1，article 2 未泄漏；
- [ ] 确认分类树、模型复核、PR 提交和 merge 后同步的最终产品行为；
- [ ] 决定 PR #2 的后续处置，并确认本计划可以归档。

用户确认后，PM 才可把本记录改为 `status: completed`，将 Spec 推进为 `accepted`，补写
RESULT 并移动计划到 `docs/plans/archive/`。
