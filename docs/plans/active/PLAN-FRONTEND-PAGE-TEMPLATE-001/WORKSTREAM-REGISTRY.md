---
kind: workstream
id: WORKSTREAM-REGISTRY
status: in_progress
plan_id: PLAN-FRONTEND-PAGE-TEMPLATE-001
role: frontend
owner: frontend
depends_on: []
write_set:
  - src/frontend/pages.registry.ts
  - src/frontend/build/page-template.ts
  - src/frontend/build/page-bootstrap.ts
  - src/frontend/build/mobile-settings-bootstrap.ts
  - src/frontend/common/page.ts
  - src/frontend/mobile/styles/app.css
  - src/frontend/vite.config.ts
  - src/frontend/mobile/src/pages/settings.tsx
  - src/frontend/mobile/pages/settings/index.html
  - src/backend/product/src/static_files.rs
  - src/backend/product/tests/
  - src/frontend/mobile/src/logic/settings.test.ts
  - src/frontend/package.json
  - docs/specs/SPEC-FRONTEND-PAGE-TEMPLATE-001.md
  - docs/plans/active/PLAN-FRONTEND-PAGE-TEMPLATE-001/
last_reviewed: 2026-09-07
---

# 工作流：注册表与生成机制（R1）

## 目标

实现注册表单一事实源与全套生成机制，并以 settings 页作首迁样板打通全链路。

## 输入

- Spec 契约节；
- 现状：`vite.config.ts` 的 alias 表与 rollup input 手工列表；`build/mobile-settings-bootstrap.ts`（泛化对象）；mobile 页 CSS import 顺序契约（tokens first / pages last）；页面 tsx 尾部 mount 样板。

## 输出

- `pages.registry.ts`：全页面声明（平台 / 路径 / 目录 / 入口 tsx / title / 可选 description / bootstrap 注入标记），现役全部页面入册；
- **服务端路由同源**：`static_files.rs` 的 `PAGES` 表与 Vite `routes` 表收敛为注册表单一来源（生成清单供 Rust 读取，或静态表保留但加"与注册表逐条对照"的 Rust/CI 测试），消除同一映射两处手抄；
- `build/page-template.ts`：从注册表生成 HTML（统一模板：charset / viewport / title / description / theme-color / 挂载点 / 模块脚本引用）；vite input 与 alias 从注册表派生（`vite.config.ts` 手工列表退役）；
- `build/page-bootstrap.ts`：由 `mobile-settings-bootstrap` 泛化——注入需求按注册表声明，子构建结果**缓存**（一次构建全程复用），旧文件删除或收编；
- `common/page.ts`：`definePage(App)` mount helper（挂载点获取 + 非空校验 + 未来组合根扩展位）；
- `mobile/styles/app.css`：现十行 import 顺序收敛为单一入口；
- settings 页首迁样板：tsx 改 `definePage`、HTML 改生成、CSS 改单入口——一页全链路绿。

## 实施任务

1. 注册表（含全部现役页面数据迁移）；
2. HTML 生成 + vite 派生 + 产物对照（与现 alias 逐一相等）；
3. bootstrap 泛化 + 缓存；
4. `definePage` + CSS 单入口 + settings 样板迁移；
5. 机制自测 + Spec 证据回填。

## 测试/验收

- 机制单测：注册表→HTML 字段断言、alias 对照现值、bootstrap 单次构建断言；
- settings 样板页构建产物走查 + 首绘防闪屏回归；
- 四命令全绿（此时其余页面未迁，新旧机制并存期构建产物不变）。

## 阻塞

无（机制层不与在途业务写集冲突；`vite.config.ts` 修改按争抢串行）。

## 交付记录

- 2026-09-07：执行启动；Product 静态路由由本工作流独占并先于 ARCH 后端治理交接，补齐 `/m/settings/index.html`。
