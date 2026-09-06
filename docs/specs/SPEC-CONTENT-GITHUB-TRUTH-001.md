---
kind: spec
id: SPEC-CONTENT-GITHUB-TRUTH-001
status: draft
owner: backend
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
last_reviewed: 2026-09-06
---

# 内容真源 GitHub 化（服务器 = 代理与缓存）

## 目标

私有 GitHub 内容仓库成为文章与资源的唯一真源；服务器降级为代理与缓存：写作经服务器写 feature 分支并提 PR、由用户手动 merge 发布；服务器在凌晨定时重启（及手动触发）时从 main 全量导入重建 SQLite 缓存；图片以 GitHub release 资产为 origin、服务器磁盘缓存代理。发布语义 = git 语义（feature 分支 = 草稿，main = 已发布，merge = 发布）。

## 非目标

- 不做 webhook / 轮询同步循环（同步只发生在启动与手动触发）；
- 不做服务器自动合并 PR（合并权永远在用户手上）；
- 不做 TLS / 域名 / 公网 unit 生产化（归公网部署计划；本计划交付 timer 模板与凭证注入约定）；
- 不做多写者并发协调（单人写作，冲突由 GitHub 自然暴露）；
- 不动 Mobile 端、公开 API 读契约（前台行为零变化，仅数据来源变为导入缓存）；
- `SPEC-ADMIN-AUTH-001`（session + TOTP）不受替代：编辑器入口鉴权与 PAT 保护仍依赖它。

## 契约

- **真源仓库**：私有 GitHub 仓库，含文章（含 frontmatter 元数据）、taxonomy 配置、图片 release 资产；布局与 frontmatter 格式由 REPO-CONTRACT 工作流设计并经用户审定。
- **写路径**：编辑器"保存"→ 服务器（持细粒度 PAT，仅该仓库 contents 读写）→ feature 分支 commit；编辑器"提 PR"→ 服务器创建 PR（标题 = 文章标题，正文含摘要与变更说明）；服务器任何路径都不得自动 merge。
- **读路径（同步）**：服务启动时 pull `main` → 解析 → 事务性全量重建 SQLite 文章数据（幂等，可重复执行）；凌晨定时重启由 systemd timer / cron 触发；手动同步入口复用同一流程。
- **派生状态**：推荐位等派生数据存服务器侧派生存储，全量重建时不丢失（重建范围仅内容表）。
- **图片链路**：上传 → 服务器 → 该仓库 release 资产；正文引用服务器域名路径（如 `/assets/<id>`）；该路径首次访问回源 GitHub、落盘缓存，之后恒久服务缓存副本。
- **凭证**：PAT 与仓库配置经环境变量注入（`BLOG_CONTENT_REPO`、`BLOG_CONTENT_TOKEN`）；读路径不依赖凭证可用性（启动导入失败时以上次缓存继续服务并告警）；写路径凭证缺失时明确报错；凭证不落日志。
- **draft/published 语义**：main = 已发布；feature 分支 / 开放 PR = 草稿；数据库不再持有发布状态的写路径（导入自 main 的内容天然全为已发布）。
- **编辑器语义变化**：移除"保存并发布 / 取消发布"按钮；保留保存（写分支）、分屏预览、WASM 校验；新增"提 PR"与 PR 状态展示。

## 场景

### SPEC-CONTENT-GITHUB-TRUTH-001-001

Given `main` 含文章 A、feature 分支含未合并文章 B

When 服务器启动（或手动同步）完成

Then 前台可见 A、不可见 B；重复执行同步结果幂等一致

### SPEC-CONTENT-GITHUB-TRUTH-001-002

Given 白天用户 merge 了一篇文章的 PR

When 触发手动同步

Then 前台在分钟级呈现该文章，无需等待凌晨重启

### SPEC-CONTENT-GITHUB-TRUTH-001-003

Given 用户在编辑器保存新文章

When 保存与提 PR 操作完成

Then 仓库出现对应 feature 分支与 commit，并存在指向 `main` 的开放 PR；PR 未被合并，服务器不执行任何 merge

### SPEC-CONTENT-GITHUB-TRUTH-001-004

Given 编辑器上传图片

When 上传完成

Then 仓库 release 存在该资产；正文插入的 URL 指向服务器域名路径；首次访问回源成功，再次访问命中磁盘缓存；GitHub 不可用时已缓存图片照常服务

### SPEC-CONTENT-GITHUB-TRUTH-001-005

Given 已生成推荐位后触发夜间全量重建

When 重建完成

Then 推荐位保留，不因重建丢失

### SPEC-CONTENT-GITHUB-TRUTH-001-006

Given `BLOG_CONTENT_TOKEN` 缺失或失效

Then 读路径与已缓存图片不受影响（启动导入失败时沿用上次缓存并告警）；写路径与图片上传明确报错，不静默失败

### SPEC-CONTENT-GITHUB-TRUTH-001-007

Given 现有 SQLite 中的存量文章

When 执行一次性初始导入工具

Then 仓库中生成对应文章文件，经同步 round-trip 后前台内容与导入前一致

### SPEC-CONTENT-GITHUB-TRUTH-001-008

Given 本计划全部改动上线

Then Mobile 与 Desktop 公开页面行为零变化；`pnpm --dir src/frontend` 四命令与 Rust 测试全绿

## 边界与失败

- **GitHub 宕机**：读路径全天可用（已导入内容 + 已缓存图片）；写路径、冷图片回源、启动全量重建失败（此时沿用上次缓存并告警，服务不拒启）；
- **导入半途失败**：事务性重建，失败即回滚，缓存保持旧版本；
- **PR 冲突**：由 GitHub 在 PR 页自然提示，用户自行处理，服务器不做合并逻辑；
- **frontmatter 与校验**：导入侧以 Rust HTML profile 校验文章内容（复用既有门禁语义），非法内容拒绝导入并产出诊断；
- **dev / mock 场景**：新链路的本地开发形态（真实测试仓库 fixture / mock GitHub）由 REPO-CONTRACT 工作流设计并报用户审定；
- **仓库布局一旦冻结即受契约保护**：变更布局 = 变更真源结构，需迁移说明与用户确认。

## 测试/验收证据

- 自动化测试：待补充（导入幂等与事务回滚、frontmatter 解析与非法内容拒绝、图片缓存命中 / 回源 / 回源失败、PAT 缺失分支行为、分支与 PR API 封装、存量迁移 round-trip）；
- 人工验收：待补充（真实仓库走通 保存→PR→merge→手动同步→前台生效 全链路、凌晨 timer 演练、GitHub 断连演练、编辑器新交互走查）。
