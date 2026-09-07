---
kind: workstream
id: WORKSTREAM-REGISTRY
status: completed
plan_id: PLAN-FRONTEND-PAGE-TEMPLATE-001
role: frontend
owner: frontend
depends_on: []
write_set:
  - src/frontend/pages.registry.ts
  - src/frontend/build/page-template.ts
  - src/frontend/build/page-bootstrap.ts
  - src/frontend/build/mobile-settings-bootstrap.ts
  - src/frontend/solid/page.ts
  - src/frontend/mobile/styles/app.css
  - src/frontend/vite.config.ts
  - src/frontend/mobile/src/pages/settings.tsx
  - src/frontend/mobile/pages/settings/index.html
  - src/backend/product/src/static_files.rs
  - src/backend/product/tests/
  - src/frontend/mobile/src/logic/settings.test.ts
  - src/frontend/build/page-template.test.ts
  - src/frontend/build/page-bootstrap.test.ts
  - src/frontend/package.json
  - src/frontend/tsconfig.json
  - src/frontend/common/client/mobile-settings.ts
  - .gitignore
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
- `solid/page.ts`：`definePage(App)` mount helper（挂载点获取 + 非空校验 + 未来组合根扩展位），Solid 依赖不进入无 UI 的 `common`；
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
- 2026-09-07：完成 16 页注册表、构建期 HTML 生成、Vite input/20 条 alias 派生与中文 title；临时输入位于忽略的 `.generated/pages`，构建结束后移动到既有 `dist/{desktop,mobile}/pages` 路径。
- 2026-09-07：Product 改为读取构建产物 `page-routes.json`，不再维护 Rust `PAGES` 手写表；清单缺失或非法时页面请求失败关闭，`/assets/*` 仍可独立提供。
- 2026-09-07：`page-bootstrap` 已泛化并以 Promise 缓存单次子构建；机制测试覆盖所有 Mobile 页面共享一次打包、同步主题脚本行为和 `</script>` 转义。
- 2026-09-07：验证通过：frontend `typecheck`、`lint`、`format:check`、`build`、`test:core`；Product `static_files` 3 项单测及 `full_public_admin_contract_and_static_mount` 契约测试。
- 2026-09-07：边界门禁收口时将 `definePage` 归位到 `solid/page.ts`，保持 `common` 无 UI 依赖。
