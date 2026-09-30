---
kind: plan
id: PLAN-FRONTEND-ARCHITECTURE-CONSOLIDATION-001
status: ready
owner: project-manager
created: 2026-09-30
last_reviewed: 2026-09-30
---

# Frontend 新基线与旧架构清理

## 目标

为 Desktop 与 Mobile 建立同一套页面生命周期、依赖装配、数据资源、导航意图和 UI 边界，并在全部消费者迁移完成后删除旧前端运行链，避免 `solid/page`、`solid/queries`、旧页面入口与新 `app/` 运行时长期并存。

本计划包含真实删除工作。旧架构不是迁移完成的标记或兼容层；每个旧模块必须在替代能力、消费者、测试和构建入口都确认收敛后删除。

## 当前基线

- 新运行时已有 `app/kernel`、`app/infrastructure`、`app/habitat`、`app/bootstrap` 四层；公开 Mobile 首页、文章库、检索、详情和设置已接入。
- Desktop 页面仍主要使用 `solid/page`、`solid/queries` 和旧页面 shell；`desktop-ui` 已有基础组件，但尚未成为主要 Desktop 页面基线。
- Mobile 管理文章预览仍位于 `mobile/src/pages/admin-preview-content.tsx`，它是管理端发起的 Mobile 预览，不是完整的 Mobile 管理后台。
- 旧 Mobile 页面、旧 Mobile logic、旧 Mobile components、`mobile-ui` 与新 `app/habitat/mobile/ui` 并存。
- `common/client`、`common/data` 和 `common/validation` 当前大量被旧 `solid/queries`、旧 Mobile logic 和旧 Desktop 编辑器使用；其中只有 HTML 校验能力属于明确需要延续的能力，其余旧 client/data 运行链以删除为目标。
- `pages.registry.ts`、`site-routes.json`、API golden 和架构门禁是迁移期间必须持续保持的入口与协议事实源。

## 新基线

### 页面生命周期

每个页面统一经过：

```text
入口解析参数
  → bootstrap 创建 environment
  → 获取路由清单与页面依赖
  → 创建 API / resource / command
  → 页面处理 loading / success / empty / error
  → 页面触发语义命令
  → navigation adapter 解析导航意图
  → 页面卸载并取消任务
```

Desktop 与 Mobile 只在 UI、布局、交互密度和平台专属状态上不同，不再各自维护一套数据接线和入口初始化方式。

### 职责边界

- `kernel`：平台中立的 ports、Result、Task、Resource 和状态原语。
- `infrastructure`：浏览器、内存、网络、存储和导航等宿主适配器。
- `habitat`：平台或业务域的 API、资源、页面逻辑和语义命令。
- `bootstrap`：入口参数解析、依赖创建、路由清单引导和页面挂载。
- `desktop-ui` / `app/habitat/mobile/ui`：平台隔离的 UI 组件，不访问 API、存储或路由实现。
- 页面：只编排已准备好的数据、状态、组件和命令。
- `common`：只保留仍被两端共享且不属于旧页面运行时的协议、纯函数和无 UI 逻辑。

### 导航意图

页面只发出语义导航，例如 `article-detail`、`articles`、`settings`、`admin-login`；具体 alias、query 参数和 URL 由导航适配器结合服务端路由清单生成。页面不再拼接站点 URL。

## 范围

### 纳入

- 新增 `habitat/desktop` 和 `bootstrap/desktop`，将现有 Desktop 公开页面和管理页面逐步迁移。
- 将 Mobile 管理文章预览迁移到新运行时的明确页面域，保留其“管理端 Mobile 预览”定位。
- 将旧 Mobile 尚未迁移的页面、logic 和组件迁移到新 Mobile runtime，随后删除旧目录。
- 将 `solid/queries` 的请求、DTO 映射、错误归一和竞态控制拆到 habitat API、resource、logic 和 command。
- 将旧 `solid/page` 的入口职责收敛到 bootstrap。
- 将旧 `mobile-ui` 能力迁移到新 Mobile UI；将 Desktop 页面接入 `desktop-ui`，缺失能力按组件契约补齐。
- 更新 pages registry、Vite 入口、路由清单、架构 Spec、测试、指南和 E2E 入口。
- 在删除条件满足后删除旧页面运行链及其无消费者模块。

### 不纳入

- 不改变公开 API、管理 API、wire DTO、文章可见性、发布状态语义或后端业务规则。
- 不合并 Desktop 与 Mobile UI，不建立跨平台视觉组件库。
- 不在页面迁移中顺手改变 HTML 校验规则、WASM 产物或后端校验契约；HTML 校验协议、profile/version、诊断结构和必要的 WASM 宿主适配必须保留，但可以迁移到新 runtime 的明确边界。
- 不在迁移中混入新的产品功能、页面信息架构或无关视觉改版；视觉差异必须单独记录并验收。

## 删除范围与保留判断

### 目标删除

- `src/frontend/solid/page.tsx` 及其仅为旧入口服务的辅助代码；
- `src/frontend/solid/queries/**` 及旧 query 专属测试；
- 旧 Desktop/Mobile 页面入口和页面专属旧逻辑；
- `src/frontend/mobile-ui/**`，前提是能力已迁移并且没有保留消费者；
- 旧 Mobile 样式、旧 shell 和旧页面模板中没有新运行时消费者的部分；
- 为旧运行链服务的 registry/build 分支、兼容适配和测试夹具。

### 迁移后唯一保留的旧能力

- `app/kernel`、`app/infrastructure`、`app/habitat`、`app/bootstrap`；
- `desktop-ui` 与新 Mobile UI；
- HTML 校验的 profile/version 契约、诊断类型、WASM 调用能力和必要的宿主适配；
- `pages.registry.ts`、`site-routes.json`、API golden 和构建生成器；
- 服务端管理预览 API 与文章 HTML 校验契约。

`common/client`、`common/data` 和旧页面专属的 `common/validation` 调用全部是本计划的删除目标。HTML 校验能力单独提取为平台中立契约与明确适配：校验规则、profile/version、诊断结构和 WASM 能力必须保留，但旧目录、旧 query 依赖和旧调用方式不必保留。除 HTML 校验外，不以保留 `common` 目录为目标。

任何删除项必须先通过仓库级引用扫描、构建入口扫描和运行时页面验收；HTML 校验保留项必须在收尾记录协议、消费者和新运行时归属。

## 迁移工作流

迁移按页面垂直切片推进，不先批量铺设空页面再统一收尾。每个页面都必须经历
“新入口 → 新数据链路 → 新 UI → 行为验收 → 引用扫描 → 删除旧实现”这一完整闭环；
基础设施 workstream 只在有真实页面消费者和可验证结果时算完成。

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 新基线与页面契约 | frontend+qa | - | 新 Spec、架构文档、页面 environment/navigation 类型与测试 | ready |
| Desktop runtime 基础设施 | frontend | 页面契约 | `app/habitat/desktop/**`、`app/bootstrap/desktop/**`、kernel/infrastructure 适配与测试 | ready |
| Desktop 公开页面迁移 | frontend | Desktop runtime 基础设施 | Desktop public 页面、shell、组件、页面测试和 registry/build 接线 | ready |
| Desktop 管理页面迁移 | frontend+content | 公开页面迁移、管理 API 现状确认 | Desktop admin 页面、编辑器、预览、管理组件与 E2E | ready |
| Mobile 管理预览及旧页面迁移 | frontend | 页面契约、Mobile 新 UI 能力 | Mobile preview、剩余旧页面/logic/components、相关测试与 registry | ready |
| 旧链路删除 | frontend+qa | 全部页面迁移、消费者扫描、E2E 通过 | `solid/**`、旧页面、旧 mobile-ui、旧构建分支及测试 | ready |
| 基线验收与文档收尾 | qa+pm | 旧链路删除 | architecture、Spec、CODEMAP、指南、验收证据 | ready |

共享的页面契约、registry、Vite build、导航 adapter 和公共测试属于串行写集；具体页面可按平台和页面组推进，但不得在删除旧模块前合并未完成的消费者迁移。

### 首批页面顺序

1. Desktop 公开首页：验证 Desktop environment、API/resource、语义导航和 `desktop-ui` 接入。
2. Desktop 公开文章列表、详情：复用已验证的 Desktop runtime，完成公开端闭环。
3. Mobile 管理文章预览：验证管理预览的权限、正文校验和 Mobile UI 边界。
4. Desktop 管理登录、列表、编辑、新建、taxonomy、发布工作台和预览：按业务流程拆分，每页独立验收。
5. 剩余旧 Mobile 页面、logic、components 和 `mobile-ui` 能力迁移。
6. 全量消费者扫描后，按模块逐项删除旧链路。

每个页面开始前登记以下信息，完成后补齐证据：旧 entry、目标 bootstrap、目标 habitat/page logic、API 和 command、权限、状态路径、测试、E2E 场景、可删除文件。

## 每个页面的迁移清单

1. 记录旧入口、URL alias、数据请求、状态、命令、导航和组件依赖。
2. 定义新页面 environment、page logic、resource、command 和 navigation intent。
3. 在新 bootstrap 中接入入口参数、路由清单、依赖和挂载。
4. 迁移页面组件，确保页面不直接访问 client、storage、wire DTO 或具体 URL。
5. 补齐 loading、success、empty、error、retry、取消和过期请求处理。
6. 运行类型检查、边界测试、页面逻辑测试、构建和浏览器验收。
7. 对照迁移前后 API 请求、页面 alias、主要交互和截图；差异若非目标行为，必须修复。
8. 更新 registry、路由清单、测试引用和文档后，才能标记旧实现为可删除。

## 旧架构删除门槛

只有同时满足以下条件，才允许删除一个旧模块：

- 新实现已经覆盖原页面的正常、空数据、失败、重试和取消路径；
- 所有 registry、HTML、Vite、测试、E2E、脚本和文档引用已迁移；
- `rg`、依赖图或等价检查确认无运行时消费者；
- Desktop/Mobile UI 隔离和 app 分层门禁保持通过；
- API 请求形状、路由 alias、权限边界和业务副作用没有意外变化；
- 至少完成一次真实 runtime + 浏览器验收；
- 旧模块删除后，类型检查、lint、核心测试、build 和相关 E2E 全部通过。

## 验收标准

1. 每个 registry `page id` 都有明确的新 bootstrap 映射和对应 habitat/page logic；允许多个页面在语义相同且 alias 差异明确时共享实现，但不得保留旧 `definePage` 页面入口。
2. Desktop 与 Mobile 页面遵守同一生命周期、environment 和 navigation intent 协议；API、页面逻辑和 UI 可以按平台或业务域独立实现。
3. 页面源码不包含 API endpoint、route alias、storage 访问、transport 创建或 wire DTO 映射。
4. `solid/page`、`solid/queries`、旧 Mobile 页面链路、`common/client`、`common/data`、旧页面专属的 `common/validation` 调用和无消费者的 `mobile-ui` 已删除；只保留 HTML 校验协议、诊断、WASM 能力及其必要适配。
5. `pages.registry.ts`、`site-routes.json`、后端路由清单、Product 静态入口白名单和构建输出保持一致。
6. 公开端、管理端、Desktop 预览、Mobile 预览的权限、文章状态、正文校验和导航行为不回归。
7. 浏览器 E2E 覆盖 Desktop 公开/管理和 Mobile 公开/预览的关键路径；单元测试覆盖页面逻辑和边界状态。
8. `ops quality check`、前端 typecheck/lint/format/build 和核心测试通过；相关 E2E 另有真实 runtime 证据。

## 风险与处理

- **旧 query 隐含业务语义**：迁移前按函数和消费者盘点，先迁移语义再删除文件，禁止机械移动。
- **Desktop 管理端范围过大**：按登录、列表、编辑、新建、taxonomy、发布工作台、预览拆分，每组独立验收。
- **视觉回归**：保留迁移前截图和关键尺寸检查；视觉变化不自动视为架构迁移结果。
- **路由或权限回归**：每页同时验收 alias、路由清单、管理鉴权和 401/302 行为。
- **删除后发现外部消费者**：仓库内先完成全量引用扫描；仓库外消费者不提供兼容层，必须在发布说明中明确新入口和迁移要求。

## 计划收尾

Plan 可以以 `completed`、`partial` 或 `parked` 收尾。收尾必须记录已迁移页面、已删除模块、保留模块及理由、测试和浏览器证据、未完成范围，以及继续清理所需条件。未完成的页面不会自动成为下一轮任务，必须重新明确纳入。
