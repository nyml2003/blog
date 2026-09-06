---
kind: plan
id: PLAN-CONTENT-GITHUB-TRUTH-001
status: ready
owner: project-manager
created: 2026-09-06
last_reviewed: 2026-09-06
---

# 内容真源 GitHub 化（服务器 = 代理与缓存）

## 目标

按 [SPEC-CONTENT-GITHUB-TRUTH-001](../../../specs/SPEC-CONTENT-GITHUB-TRUTH-001.md) 完成架构反转：私有 GitHub 仓库成为文章与图片的唯一真源；服务器降级为代理与缓存——写作经服务器写 feature 分支并提 PR（用户手动 merge 发布），凌晨定时重启 + 手动同步从 main 全量重建 SQLite 缓存，图片以 release 资产为 origin 磁盘缓存代理。发布语义 = git 语义。

## 决策记录（用户已定）

1. GitHub 是唯一真相，服务器只是代理和缓存；
2. 写路径 = 编辑器 → 服务器（PAT）→ feature 分支 → PR → **用户在 GitHub 手动 merge**；
3. 发布语义：feature 分支 = 草稿、main = 已发布、merge = 发布；编辑器移除发布/取消发布按钮；
4. 同步 = 凌晨定期重启时启动导入（无 webhook / 无轮询循环），**另加手动同步入口**；
5. 图片：GitHub release 资产为 origin，服务器磁盘缓存代理，前台 URL 指向自己域名；
6. 内容仓库**私有**（草稿私密；图片走缓存代理不依赖直链）；
7. 派生状态（推荐位等）留服务器，不进仓库，夜间重建不丢；
8. 存量 SQLite 文章一次性迁移进仓库。

## 成功标准

Spec 八个场景全部通过，核心可归纳为：

1. main 合入 → 手动同步分钟级生效 / 凌晨重启自动生效；feature 分支内容前台不可见；
2. 保存 → 分支与 PR 出现，服务器永不自动 merge；
3. 图片上传 → release 资产 + 服务器域名 URL + 磁盘缓存（GitHub 宕机已缓存图片可服务）；
4. 派生状态夜间重建保留；PAT 缺失 fail-safe（读路径存活、写路径明错）；
5. 存量数据迁移 round-trip 一致；
6. 公开端 / Mobile 零回归；前端四命令与 Rust 测试全绿。

## 非目标

见 Spec 非目标节（无同步循环、不自动 merge、TLS/公网 unit 归公网部署计划、不动 Mobile、ADMIN-AUTH spec 继续有效）。

## 约束与依据

- Spec：`SPEC-CONTENT-GITHUB-TRUTH-001`（本计划交付并验收）；
- 事实：`FACT-RUNTIME-001`（2C2G 单机——缓存与全量重建的设计约束）；
- 既有资产：Rust Data 层 SQLite 查询与迁移框架（读路径保留）、HTML profile 校验门禁（导入侧复用）、`ops` CLI 体系、编辑器 CodeMirror / 分屏预览（在途计划交付，全部保留）；
- 受影响计划：
  - `PLAN-DESKTOP-EDITOR-001`（在途）：其保存/发布链路将被本计划编辑器工作流取代——**待其归档后串行执行编辑器改造**，CodeMirror/预览/校验零浪费；
  - `SPEC-ADMIN-AUTH-001`（spec 已立、plan 未建）：编辑器入口鉴权与 PAT 保护仍依赖它，本计划编辑器工作流前置要求其落地（或同批交付）；
  - 公网部署计划（未立项）：TLS/域名/timer 生产化归其管辖，本计划交付模板与凭证注入约定。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 仓库契约与存量迁移 | backend | - | 见 [WORKSTREAM-REPO-CONTRACT.md](./WORKSTREAM-REPO-CONTRACT.md) | ready |
| 后端读路径（导入 + 图片缓存代理） | backend | 仓库契约 | 见 [WORKSTREAM-BACKEND-READ.md](./WORKSTREAM-BACKEND-READ.md) | ready |
| 后端写路径（分支 / PR / 上传 / 手动同步） | backend | 仓库契约 | 见 [WORKSTREAM-BACKEND-WRITE.md](./WORKSTREAM-BACKEND-WRITE.md) | ready |
| 编辑器与管理台改造 | frontend-desktop | 写路径；DESKTOP-EDITOR 归档；ADMIN-AUTH 落地 | 见 [WORKSTREAM-EDITOR.md](./WORKSTREAM-EDITOR.md) | ready |
| ops 与交付物（同步命令 / timer / 凭证） | infra | 读路径 | 见 [WORKSTREAM-OPS-DELIVERY.md](./WORKSTREAM-OPS-DELIVERY.md) | ready |

项目经理启动提示见同目录的 [PM-PROMPT.md](./PM-PROMPT.md)。

## 集成验收

- 自动化：导入幂等 / 事务回滚、frontmatter 解析与非法内容拒绝、图片缓存三分支（命中 / 回源 / 回源失败）、PAT 缺失行为、GitHub API 封装测试、迁移 round-trip；
- 人工：真实仓库全链路（保存 → PR → merge → 手动同步 → 前台生效）、凌晨 timer 演练、GitHub 断连演练、编辑器新交互走查、公开端回归；
- 文档：`docs/architecture/data-and-api.md` 与 `infrastructure.md` 重写真源与同步模型；Spec 推进 `accepted`。

## 未决项

- 仓库文件布局与 frontmatter 字段：REPO-CONTRACT 设计稿**须用户审定**后冻结；
- 手动同步入口形态：ops 命令 vs 管理台按钮 vs 两者（建议先 ops 命令，管理台按钮随编辑器工作流评估）；
- dev / mock 场景下 GitHub 链路的开发形态（真实 fixture 仓库 vs mock API）：设计稿报用户审定；
- 编辑器工作流与 `SPEC-ADMIN-AUTH-001` 落地的先后（同批或先后），PM 排期时报用户确认。
