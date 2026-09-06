# Blog 项目工作约定

本文件只适用于 `/home/nyml/projects/blog`。更具体目录中的 `AGENTS.md` 优先于本文件；项目正式文档优先于临时讨论。

## 项目边界

- 这是个人长期沉淀型技术知识库博客，后端使用 Rust + SQLite（`src/` 下的 Cargo workspace：Product API / Data Server / Mock Product API（workspace 根在 `src/Cargo.toml`）），前端使用 Solid.js + TypeScript + Vite。
- 前端目录边界：`src/frontend/common` 只放无 UI 契约和逻辑；Desktop、Mobile 不互相导入 UI；正文 HTML 由系统主题包裹，不引入自定义文章 CSS。
- 公共端和管理端的业务行为、API 契约、文章状态和可见性由后端保证；不要在前端改写领域语义。
- PC 与 Mobile 的页面、DOM、CSS、交互和内部状态可以隔离；共享数据语义和无界面契约即可。

## 文档和计划

- 开始工作前先阅读 `docs/FACTS.md`、相关 `docs/architecture/`、`docs/guides/` 和目标 plan/spec。
- 稳定事实写入 `docs/FACTS.md`；当前架构写入 `docs/architecture/`；行为契约使用 `docs/specs/`；跨职能工作使用 `docs/plans/`。
- 不把临时讨论、局部测试结果或未采用方案写成当前架构或永久事实。
- Plan 的 workstream 必须声明 owner、依赖和 write set；不要修改其他 workstream 的写集。
- 项目经理负责目标、范围、依赖、状态和验收；专业 agent 负责自己的实现和证据。未经用户确认，不改变产品目标、公共协议、永久事实或计划范围。

## 开发环境和命令

- 优先使用项目 Flake：进入项目后使用 `direnv allow` 或 `nix develop`。
- 优先使用项目本地的 `ops` 作为质量和运行入口：
  - `ops workspace doctor`（Node/pnpm/Rust/Cargo）
  - `ops quality check`
  - `ops quality lint`
  - `ops quality format --check`
  - `ops delivery build`
  - `ops runtime dev`（Vite + Mock Product API，页面数据只来自 Mock）
  - `ops runtime backend [--data mock|test]`（Rust Product + Rust Data，无页面）
  - `ops runtime integration [--watch]`（先构建 `src/frontend/dist`，再由 Product 挂载，页面与 `/api` 同源）
- 顶层退出码全局统一：`0` 成功、`10` 用法/配置错误、`20` 执行失败、`130` SIGINT、`143` SIGTERM。既有的 `1`/`2` 语义已废止。
- `ops runtime serve` 与 `ops database migrate` 已删除，不保留别名：`serve` 的替代是 `ops runtime integration`；迁移由 Data Server 启动时自动执行（不再有独立迁移命令）。
- 基础质量门禁包括：Rust 三件套（`cargo fmt --all --check`、`cargo clippy --workspace --all-targets -- -D warnings`、`cargo test --workspace`）、前端 `typecheck`、Oxlint、Biome `format:check`、核心测试、ops 契约测试和前端构建。Go 已于 2026-09-06 退场（门禁与代码均已移除）。
- 不为单个项目修改全局 Shell、Nix、包管理器或系统配置。依赖和工具变更留在本项目的 Flake、package manifest 或 lockfile 中。
- 如果包管理器因依赖安装脚本或环境问题失败，先记录精确错误；可以使用已经存在的项目本地二进制做等价只读检查，但不得擅自批准构建脚本或更新 lockfile。

## TypeScript/TSX 规则

- TypeScript/TSX 任务必须先阅读：
  - `docs/guides/typescript-style.md`
  - `docs/guides/typescript-review-checklist.md`
  - `src/frontend/tsconfig.json`
  - `src/frontend/package.json`
  - `src/frontend/.oxlintrc.json`
  - `src/frontend/biome.json`
- 目标是降低认知复杂度，让主路径、错误路径、边界条件和业务意图可以独立阅读。
- 优先卫语句和早返回；复杂条件拆成命名布尔值、谓词函数或显式分支。
- 三元表达式、`&&`、`||`、`??` 允许用于简单、纯值表达；不得隐藏请求、写入、状态变更或其他副作用；避免嵌套三元。
- 可选值优先使用 `undefined`；外部边界的 `null` 在边界处归一化，不向领域层扩散。
- 业务状态优先使用可辨识 union 或 `Result`；错误边界和异步等待、取消、超时、拒绝处理必须清晰。
- 类型收窄优先使用类型守卫和运行时验证；不要用 `as` 或非空断言掩盖未知状态。
- 一个 `type` 或 `interface` 的字段可选性，以及函数入参的可选性，必须有明确整体语义：默认要么全部必填（`Required` 语义），要么全部可选（`Partial` 语义），不要在同一对象类型、函数入参对象或函数参数列表中随意混合必填和可选参数。
- 只有表达明确协议边界的类型才允许混合可选性，例如固定 discriminant + 分支字段、外部响应的渐进归一化对象或明确的 patch 输入；必须在命名或 Review 中说明原因。
- 命名应表达业务角色，函数保持单一主要职责；测试、脚本和工具代码遵循同一认知复杂度原则。
- 不因工具方便就禁止所有三元或逻辑运算符，也不把个人偏好变成机械禁令。

## Agent 工作流程

处理 TypeScript/TSX 任务时按以下顺序执行：

1. 读取本文件、项目正式规范、目标 plan/spec、配置和测试入口。
2. 先运行现有 typecheck、lint、format check 和相关测试，记录准确命令、结果和环境阻塞。
3. 再逐文件人工 Review，检查隐式分支、隐藏副作用、错误边界、异步控制流、类型断言、命名、函数职责和测试可读性。
4. 将发现区分为机械告警、认知问题、业务行为风险和环境问题；工具通过不能代替人工 Review。
5. 只有用户明确授权整改、重构或治理时才修改源码。仅建立规范、制定计划或做 review 时，不得修改代码。
6. 交付时说明修改范围、扫描命令、测试结果、人工 Review 发现、例外理由、未解决问题和文档影响。

## 变更安全

- 修改前确认目标文件、所属 write set 和是否存在其他自动化流程正在更新同一范围。
- 不回退用户或其他 agent 的已有修改；遇到重叠变更时基于当前内容继续工作。
- 不执行删除、批量依赖更新、系统级配置变更或大范围格式化，除非用户明确授权且已说明影响范围。
- 修改文档或配置也要保持最小范围；不要顺手重构无关代码。
