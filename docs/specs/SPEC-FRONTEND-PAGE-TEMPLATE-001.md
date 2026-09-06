---
kind: spec
id: SPEC-FRONTEND-PAGE-TEMPLATE-001
status: draft
owner: frontend
plan_id: PLAN-FRONTEND-PAGE-TEMPLATE-001
last_reviewed: 2026-09-07
---

# 前端页面模板与接入统一（注册表驱动）

## 目标

建立页面注册表作为单一事实源：`index.html` 由构建期从模板 + 注册表生成（手写 HTML 退场），vite input/alias 从注册表派生，页面接入统一为 `definePage(App)`，CSS 入口契约集中一处，首绘 bootstrap 注入机制泛化并修复重复子构建。head 元数据（title 等）按统一规范落地。本计划的追加交付还须满足 `SPEC-FRONTEND-T-SHELF-001`。

## 非目标

- 不做 SEO 套件（og / sitemap / 结构化数据，v1.1+）；
- 不做 SSR / 路由框架引入（保持 MPA）；
- 除 `SPEC-FRONTEND-T-SHELF-001` 明确的公开端货架改造外，不改其他页面功能与视觉；
- 不动 mobile-ui / 组件层（归各自计划）；
- ARCH-BOUNDARY 的"零行为变化"红线不受本计划影响（本计划独立立项，正因 title 变化属可见变化）。

## 契约

- **注册表**（单一事实源）：每页声明——平台（mobile/desktop）、路由路径（alias）、页面目录、入口 tsx、title、可选 description；vite input / alias / HTML 生成 / head 注入全部从注册表派生，任何页面信息不再存在第二处手写。
- **服务端路由表同源**：`static_files.rs` 的 `PAGES` 表与 Vite `routes` 表现状为同一映射的两份手抄；本计划将其收敛——注册表产出服务端路由清单（构建期生成清单文件由 Rust 启动时读取，或保留 Rust 静态表但以"与注册表派生清单逐条对照"的测试锁死同步），实现形态由机制工作流定并记录，终点是加页面不再需要改两处。
- **title 规范**：公开端 `{页面名} - 技术知识库`；管理端 `{页面名} - 管理台`；现存英文占位符（Blog Mobile / Articles Mobile / Article Mobile / Blog / Admin / New Article 等）全部替换为规范中文 title。
- **HTML 生成**：统一模板产出（charset / viewport / title / 可选 description / theme-color）；mobile 页注入首绘 bootstrap 内联脚本（现 `mobile-settings-bootstrap` 机制泛化：重命名为通用 `page-bootstrap`，注入需求按注册表声明，子构建结果缓存——同次构建 n 页只打包一次）。
- **mount 统一**：`definePage(App)`（或等价 helper）内部完成挂载点获取与非空校验；页面 tsx 不再出现 `render(() => <App />, document.getElementById("app")!)` 样板。
- **CSS 入口统一**：mobile 各页的 10 行样式 import 顺序契约（tokens first / pages last）收敛为单一入口（如 `mobile/styles/app.css`），页面只 import 一处。
- **组合根衔接**：`definePage` 是未来 transport 装配的规范落点（与 `SPEC-ARCH-BOUNDARY-001` 组合根白名单衔接，本计划只立机制不迁逻辑）。

## 场景

### SPEC-FRONTEND-PAGE-TEMPLATE-001-001

Given 注册表就位

When 新增一个页面

Then 只需注册表加一行（含路径 / 入口 / title），HTML 生成、vite 注册、head 注入自动就绪，无任何第二处手写

### SPEC-FRONTEND-PAGE-TEMPLATE-001-002

Given 构建产物

Then 每页 HTML 格式统一，charset / viewport / 规范 title / theme-color 齐备；mobile 页含首绘 bootstrap；全部 title 符合命名规范，无英文占位符

### SPEC-FRONTEND-PAGE-TEMPLATE-001-003

Given 全部页面 tsx

Then 均以 `definePage(App)` 收尾；仓库无 `getElementById("app")` 样板残留；mobile 页 CSS import 收敛为单一入口且顺序契约不变

### SPEC-FRONTEND-PAGE-TEMPLATE-001-004

Given 一次完整构建

Then bootstrap 子构建仅执行一次并被全部 mobile 页复用（构建耗时不劣化于现状的常数倍以内）

### SPEC-FRONTEND-PAGE-TEMPLATE-001-005

Given 本计划全部改动

Then 各页功能、视觉、首绘行为零回归（title 等元数据变化除外）；`pnpm --dir src/frontend typecheck / lint / build / test:core` 全绿；产物路由与迁移前一致（alias 逐一对照）

## 边界与失败

- 手写 index.html 全部删除，构建期生成；若某页需要特殊 head 标签，经注册表扩展字段声明，不回退手写；
- 在途计划写集冲突（mobile 页面在 BROWSE / 原子 R4-R5；desktop admin 在 EDITOR / CONTENT-TRUTH；`vite.config.ts` 多计划争抢）：迁移轮次按写集交接串行，机制开发（注册表 / 插件 / helper）可先行；
- `admin-article-preview-content` 等在途新页面照常入注册表；
- theme-color 静态取纸张色；动态随主题切换的能力留待原子 R4-R5 / v1.1，不在本计划。

## 测试/验收证据

- 自动化测试：待补充（注册表 → 生成 HTML 的快照或字段断言、alias 与迁移前对照、bootstrap 单次构建断言、`getElementById` 样板零残留的静态检查）；
- 人工验收：待补充（抽样页面构建产物 head 与 title 走查、首绘防闪屏回归、各页功能冒烟）。
