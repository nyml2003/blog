# 内容分类树与 GitHub PR 工作流证据

## 结论范围

本证据证明真实 GitHub 内容仓库、模型分类、单一 active PR、merge 后同步、下一批保留、
公开快照隔离和浏览器可见行为已经形成闭环。它不代替用户对当前 PR diff、视觉表现或
最终产品行为的确认，也不批准自动 merge 或发布。

## 真实 GitHub 工作流

- 私有内容仓库：`nyml2003/blog-content-e2e`；
- [PR #1](https://github.com/nyml2003/blog-content-e2e/pull/1)：已 merge，merge commit
  `b51129f0aaff802b75ef0d5c738721d5d9c1068b`；
- PR #2：[仍为 open](https://github.com/nyml2003/blog-content-e2e/pull/2)，head
  `32c6d2f9142e682e27a7e94cbb8e7aa3c7422398`；
- PR #1 首次提交后，在同一个 PR 更新文章；服务器没有创建第二个 active PR，也没有自动 merge；
- PR #1 merge 后，Product 从 `main` 同步已发布 snapshot，清理已合入批次，并把提交后新增的
  article 2 保留为下一批；随后创建 PR #2；
- 同步完成后的工作区版本为 6；
- 公开 API 和页面只包含 article 1；尚未合入的 article 2 没有泄漏到公开快照。

E2E 驱动脚本为 [github-workflow-e2e.mjs](./evidence/github-workflow-e2e.mjs)，模型证据命令为
[taxonomy-model-e2e.mjs](./evidence/taxonomy-model-e2e.mjs)。脚本只保留可公开复核的状态和
断言；运行所需敏感配置通过进程环境注入，没有写入本计划目录、报告或截图。

## 浏览器证据

[浏览器报告](./evidence/browser/report.json) 的 `passed` 为 `true`，17 条检查全部通过，
页面错误列表为空。报告确认：

- 管理端登录页可见，受保护目标能够保留；
- 内容工作区显示 submitted 状态和真实 active PR #2；
- Desktop 与 Mobile 公开端没有管理导航；
- 待合入的 article 2 没有出现在公开端；
- Desktop 和 Mobile 检查均无横向溢出，页面运行时错误为 0。

四张截图及用途见 [evidence/README.md](./evidence/README.md)。这些截图和自动化断言是行为
证据，不单独证明两个 F 型入口的完整交互，也不代替用户对视觉细节的最终判断。F 型
一级/二级切换、父级汇总去重和返回恢复见页面计划的
[浏览器证据](../PLAN-FRONTEND-PAGE-TEMPLATE-001/evidence/README.md)。

## 自动化门禁

- 全量 runtime gate：13/13 通过；
- ops 契约测试：总计 108 项，无失败；
- Rust、协议、Product、Data、Mock、前端和架构边界的相关门禁在本计划集成运行中通过；
- 浏览器报告：17/17 通过，页面错误 0。

## 真实运行环境边界

真实 GitHub 工作流使用直接启动的 Product 与 Data release 进程，并让 Data 使用独立的
新数据库。没有使用 `ops runtime integration` 的固定 seed test 数据库：该 seed 已包含
较高的 `next_category_id` 水位，而新建空内容仓库从初始水位开始，同步会被 ID 水位回退
保护拒绝。

这是固定 seed 与空仓库组合的环境现象。它解释了本次真实证据为何采用独立 release
进程，不构成该组合已经通过、产品规则需要放宽或生产同步失败的证据。全量 runtime gate
13/13 是独立的自动化运行结果，不能替代这一环境边界说明。

## 待用户验收

尚未完成的项目只包括 [ACCEPTANCE.md](./ACCEPTANCE.md) 中的 PR #2 人工 review、公开端
抽查和最终产品确认。PR #2 保持 open，本计划不自动合入、不归档。
