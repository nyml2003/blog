---
kind: plan
id: PLAN-FRONTEND-E2E-001
status: partial
owner: project-manager
created: 2026-09-29
last_reviewed: 2026-09-30
---

# 前端浏览器端到端测试

## 目标

建立一套可重复运行的 Playwright 浏览器回归测试，验证真实运行栈中的页面、API、路由、资源状态和关键用户操作。测试从用户可观察行为出发，补足当前 TypeScript 单测、Rust 契约测试和人工验收之间的空白。

## 当前基线

- `scripts/test-article-html-browser.mjs` 曾通过 `playwright-core` 和外部 Chromium 做浏览器验收；本计划新增的统一入口为 `ops e2e`，不再以 scripts 目录作为运行入口。
- 历史 Mobile 浏览器证据曾以临时 Playwright 脚本记录在归档 Spec 中；当前没有稳定的 `e2e/` 目录、测试配置、fixture 生命周期、报告目录或独立命令。
- `ops runtime integration` 会构建前端并启动 Product + Data(test)，适合真实同源页面验收；`runtime dev` 使用 Vite + Mock，适合故障和快速交互场景。
- `docs/specs/SPEC-OPS-RUNTIME-001.md` 已更新为允许通过显式 `ops e2e` 编排浏览器验收，不改变快速质量门禁的默认语义。
- `docs/guides/testing.md` 规定稳定的公开端和预览流程可以补浏览器自动化，并要求区分自动化证据与人工验收。

## 测试边界

| 层 | 验证内容 | 不验证 |
| --- | --- | --- |
| 浏览器 E2E | 页面能打开、用户操作、URL/历史、页面状态、同源 API 联动、关键响应式和可访问名称 | 每个组件的内部实现、所有 CSS 像素、后端 SQL 细节 |
| API/契约测试 | envelope、错误码、路由和 wire 形状 | 浏览器布局与真实点击路径 |
| 前端单测 | 纯逻辑、资源竞态、组件契约 | Product/Data 进程联动 |
| 人工验收 | 视觉质量、阅读密度、真实设备体验 | 可重复的基础回归断言 |

E2E 只覆盖高价值用户旅程，不把所有单元测试重新写一遍。每个场景必须有稳定的用户可见断言；禁止只断言请求发出或内部函数调用。

## 首批场景

1. **公开 Mobile 阅读**：打开首页，进入文章库，选择分类，确认 URL 与前进/后退恢复，打开详情，返回文章库；覆盖窄屏无横向溢出和关键导航名称。
2. **公开 Desktop 阅读**：打开首页、文章档案和详情，确认筛选/链接/正文可见；覆盖至少一个宽屏 viewport。
3. **加载与失败状态**：使用 `runtime dev` 的 `empty`、`slow`、`server-error` 或 `malformed-response` 场景，验证 loading、empty、error、retry 的可见反馈和旧结果不覆盖新选择。
4. **Mobile 设置**：修改主题和字体，刷新后保持；验证设置首绘、保存失败恢复和页面导航不回归。需要稳定注入故障时先补 Mock 场景或测试 seam，不在脚本里篡改生产模块。
5. **管理端关键链路**：在明确测试凭证和隔离数据库后，覆盖登录、创建/保存草稿、正文校验失败、预览或发布中的一条主路径；不在首批复制全部编辑器单测。
6. **安全与静态边界**：正文预览拒绝危险 HTML，页面无未捕获错误，移动和桌面代表页面不出现横向溢出。已有 `test-article-html-browser.mjs` 的深度校验可作为独立专项或迁入共享 fixture。

首批场景的具体页面和断言以当前源码、fixture 数据和用户旅程复核为准；若某场景需要改产品行为，先拆成单独决策，不用测试反向定义产品契约。

## 运行策略

- 优先复用 `playwright-core` + 项目 Flake 提供的 Chromium，避免重复下载浏览器；由 `ops e2e` 通过显式参数接收模块和 Chromium 路径，缺失时可读失败。
- 建立独立 E2E 命令，负责启动隔离的 integration/dev 栈、等待健康与页面可达、执行测试、保存日志/截图/trace、按信号清理子进程。命令必须使用临时端口、临时数据库和隔离 Mock session。
- 默认 `ops quality check` 保持快速，不自动启动浏览器；提供显式 `ops ... e2e` 或等价脚本，并在 CI 中单独 job 运行。是否把命令纳入 ops 由 Spec 决策工作流确认。
- 测试失败保留最小诊断包：场景名、viewport、页面 URL、console/pageerror、截图；trace/video 只在失败或显式开关时保存，控制资源占用。
- 测试应支持单场景运行、重试一次和串行模式；重试不能掩盖非确定性，报告必须记录首次失败和最终结果。

## 成功标准

1. 至少一套独立 E2E runner/config、隔离 fixture 和显式运行命令可以在干净工作树执行；缺少 Chromium 或依赖时快速失败并说明配置。
2. 首批公开 Mobile、公开 Desktop、失败状态和设置场景自动化；管理端场景在凭证/数据隔离条件满足后加入，否则明确记录未交付。
3. 测试覆盖真实同源 integration 至少一轮，并覆盖 Mock 故障场景；不会把只启动 Vite 或只打 API 误报为完整 E2E。
4. 每个场景有稳定定位策略、用户可观察断言、失败截图/日志和清理保证；连续运行结果可复现。
5. 测试命令、运行前提、产物目录、CI 触发策略和跳过条件写入当前指南；若改变 `SPEC-OPS-RUNTIME-001` 的“不引入 E2E runner”约束，完成对应 Spec 更新。
6. `ops quality check`、前端核心测试和 E2E 分层结果分别报告；E2E 失败不会被普通单测绿灯掩盖。

## 非目标

- 不把所有页面、所有 viewport 或所有组件都纳入第一轮；
- 不用截图像素快照替代语义断言和人工视觉验收；
- 不在 E2E 中直接访问 SQLite、修改生产代码状态或依赖真实 GitHub 内容仓库；
- 不默认下载大型浏览器依赖、不改全局环境、不把凭证写进命令行、日志或截图；
- 不把 E2E runner 自动塞进现有快速质量门禁，除非 Spec 和资源预算明确调整。

## 约束与依据

- `docs/guides/testing.md`：分层测试策略、浏览器自动化与人工验收的关系、`OPS_RUNTIME_E2E` 门控经验。
- `docs/specs/SPEC-OPS-RUNTIME-001.md`：runtime 进程矩阵、端口、生命周期和当前“不引入 E2E runner”约束。
- `docs/guides/operations.md`：`runtime dev`、`runtime integration` 的命令和参数契约。
- `scripts/test-article-html-browser.mjs`：现有 Playwright 核心调用、浏览器路径环境变量、截图和隔离运行经验。
- `docs/architecture/frontend.md`、`docs/specs/SPEC-ARCH-BOUNDARY-001.md`：页面入口、同源 API、Desktop/Mobile 隔离和新旧运行时边界。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| E2E 契约与运行策略 | qa+pm | - | 本计划、`docs/guides/testing.md`、必要时 `SPEC-OPS-RUNTIME-001.md` | completed |
| Runner 与隔离栈 | qa+infra | 契约与运行策略 | `apps/blog/src/e2e/**`、测试配置、隔离启动/清理代码、ops 入口 | completed |
| 公开端旅程 | frontend+qa | Runner 与隔离栈 | E2E 场景、fixture、截图/trace 规则 | completed |
| 故障与设置旅程 | frontend+qa | Runner 与隔离栈 | Mock 场景接线（如必要）、E2E 场景与故障断言 | completed |
| 管理端与专项安全旅程 | frontend+qa | Runner、凭证/数据隔离决策 | 管理端 E2E、正文预览专项迁移或保留适配 | partial |
| CI 与验收收尾 | qa+pm | 以上工作流 | CI job、指南、测试报告、计划结果 | partial |

不同旅程可以并行写不同场景文件；runner、ops 入口、锁文件和测试配置属于共享写集，必须串行修改。

## 集成验收

1. 在隔离临时端口运行真实 integration，执行公开端旅程并确认 Product/Data/Vite 进程按预期退出；再运行 dev Mock 故障场景。
2. 在至少 Desktop 与 Mobile 两种 viewport 下执行代表场景，检查 URL、历史、页面状态、可访问名称、横向溢出和页面错误。
3. 连续运行同一套测试至少两次，确认 fixture、端口、数据库和 session 不互相污染；故意制造失败，确认截图、日志、trace 和清理产物完整。
4. 运行前端核心门禁和 `ops quality check`；分别记录 E2E 未执行、跳过或环境不足的场景。
5. 计划结束记录已自动化旅程、保留人工验收旅程、未解决的不稳定性和后续扩展条件；允许以 `partial` 收尾。

## 未决项

- E2E 统一由 `ops` 管理，提供独立、显式的 E2E 子命令；具体参数和进程契约在 Runner 工作流中确定。
- 继续使用外部 `playwright-core` + Flake Chromium，还是引入项目锁定的 Playwright 包与浏览器安装流程；以可复现性、仓库体积和 CI 环境决定。
- 管理端测试凭证采用专用 fixture、临时初始化命令还是测试 bypass；不得复用开发者真实凭证。
- 失败 trace/video 的保留期限、CI artifact 大小和是否支持并行 worker；以本地资源和 CI 时限实测决定。

## 收尾记录

- 实际交付：新增 `ops e2e`；runner、隔离运行栈、端口分配、信号清理、Playwright 直接加载、公开 Desktop/Mobile 旅程、Mock empty/slow/server-error/malformed-response 场景、Mock 管理端登录与危险 HTML 校验旅程、截图、失败截图和机器可读的 `report.json` 均位于 `apps/blog/src/e2e/**`；参数 Spec、运行指南和测试指南已同步。
- 已验证：`pnpm exec tsc --noEmit`、Ops CLI/help 测试、E2E runner 单测和 `git diff --check` 通过；dry-run 不探测端口、不启动进程、不写文件。真实浏览器曾执行 `ops e2e --mode dev --scenario empty`，产物为 `target/e2e/1790734393013-79109`；真实 integration 已执行并通过，产物为 `target/e2e/1790734421610-79268`。在解除进程限制后，Flake Chromium 再次通过，产物为 `target/e2e/1790735536343-83417`；系统 Chrome 也通过，产物为 `target/e2e/1790735507916-83280`。受限环境中的失败报告 `target/e2e/1790735083183-82199/report.json` 已记录 `failed` 状态和 Chromium 错误摘要。
- 未交付：真实 Product 管理凭证下的登录/编辑主链路、CI job、连续运行两次的专门验收、失败 trace/video 策略，以及设置保存失败的专用 Mock 场景仍未完成。Mock 管理端登录和危险 HTML 拒绝已自动化；保存接口已有 runtime stack API 集成证据，浏览器编辑器保存仍保留为后续专项。
- 收尾原因：Ops 编排、公开端旅程、开发态故障场景和真实 integration/dev 浏览器证据已具备；管理端凭证隔离与 CI 资源条件仍未形成可审查实现，因此保持 `partial`。
- 恢复条件：提供专用管理端 fixture/凭证隔离方案和 CI 浏览器资源预算后，补齐管理端旅程、CI job、重复运行验收及失败诊断策略，再评估是否完整归档。
