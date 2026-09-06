---
kind: workstream
id: WORKSTREAM-REPO-CONTRACT
status: archived
outcome: partial
archived: 2026-09-07
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
role: backend
owner: backend
depends_on:
  - PLAN-MOBILE-BROWSE-IA-001:shared-write-set-handoff
write_set:
  - docs/content-repo/
  - src/core/protocol/src/
  - src/core/protocol/tests/
  - src/backend/product/src/content_contract/
  - src/backend/product/src/content_contract.rs
  - src/backend/product/src/lib.rs
  - src/Cargo.toml
  - src/Cargo.lock
  - src/backend/product/Cargo.toml
  - src/backend/data/Cargo.toml
  - src/backend/mock/Cargo.toml
  - src/core/protocol/Cargo.toml
last_reviewed: 2026-09-07
---

# 工作流：仓库与接口契约

## 目标

将用户已确认的布局、单工作区、临时保存和整批 PR 语义变为统一读写契约，提供纯解析/编码及隔离样例。没有存量迁移、frontmatter 或图片任务。

## 输入与边界

- 内容 Spec 全部目标行为、现有 Article/taxonomy 的 ID、摘要、关联和时间字段；
- HTML 权威是 `src/core/article-html-core`，不是 protocol；Product 解析和检查，Data 只接收类型化的合法快照；
- 用户已确认 `taxonomy.json` 与 `articles/<ID>/{meta.json,content.html}`、开发模拟 GitHub和后台手动同步，不重复询问这些选择；
- 共享协议和依赖文件统一由本工作流维护。其他工作流提交需求后串行更新；不代写其业务模块。
- 本计划目录与两份关联 Spec 由 PM 维护，本工作流通过交付报告提供契约/证据变更。

## 交付

1. `docs/content-repo/CONTRACT.md`：JSON 字段与版本、原始 HTML 文件编码、目录 ID 与元数据一致性、taxonomy 引用规则、稳定 ID 分配/恢复规则、首次合入时间的历史恢复和完整往返样例。
2. 空仓库模板：合法空 taxonomy、main 初始化说明；测试文章只放隔离 fixtures，不混入初始真实内容。
3. Product 侧纯解析/编码模块：解析完整仓库快照，返回有文件定位的错误；复用 HTML core；不访问 SQLite/GitHub，不静默改写正文。
4. 层间协议：快照事务替换、同步版本、持久推荐引用；沿用公共读 DTO 和排序契约。
5. 管理协议：工作区/文章读取、文章/taxonomy 保存、暂存下架、批次提交/放弃、PR 状态、手动同步；冻结 GET/POST 路径、sceneCode、DTO、工作区版本及错误码，对应公共客户端和 Mock 映射。
6. 状态契约区分“临时已保存”“正在提交”“已提交 PR”“已合并待同步”“同步失败/成功”；表示已提交后又有临时变化，不能把保存成功等同 GitHub 提交成功。
7. 明确分支与提交标识，使请求超时、commit 成功/PR 失败和重启后可识别同一批次；远程状态不明不得另建分支。
8. 明确生产 GitHub 与 fixture 来源的显式选择、凭证最小权限及资源上限；不得通过 PAT 存在与否自动切换来源。

## 顺序与验收

- 可先整理契约文档；共享源文件经 Mobile 计划交接后再实现协议与模块，并交付编译/测试证据。
- 原始 HTML 往返不变；错误 JSON、路径/ID 不一致、重复 ID、缺失文件、非法 HTML 和引用缺失均拒绝完整快照。
- 新 taxonomy 与新文章整批解析成功；ID 和首次发布时间在历史恢复、下架后恢复时保持稳定。
- 接口和样例覆盖工作区版本冲突、PR 重试、未提交临时变化以及提交与同步状态。
- 相关 Rust 测试通过，协议供 Data/Product/Mock/客户端一致消费；没有新增公开读行为。

## 当前阻塞与记录

2026-09-07：已交付 `docs/content-repo/CONTRACT.md`、空 taxonomy 模板，以及 Product 侧解析/写回/完整快照校验和测试。共享 protocol 的快照事务 DTO、Data operation 和跨层交接仍待交付。
