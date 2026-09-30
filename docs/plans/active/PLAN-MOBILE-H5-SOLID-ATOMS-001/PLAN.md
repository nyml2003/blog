---
kind: plan
id: PLAN-MOBILE-H5-SOLID-ATOMS-001
status: ready
owner: project-manager
created: 2026-09-30
last_reviewed: 2026-09-30
---

# Mobile H5 Solid UI 原子组件包

## 目标

将 `src/frontend/app/habitat/mobile/ui/atoms` 抽取为独立的 workspace 包
`@fluvient-loom/mobile-h5-solid-atoms`，明确它是面向 Mobile H5 的 Solid.js UI 原子组件库。
博客前端先通过 workspace 包消费，完成 API、样式、构建和测试验收后，再决定是否发布到 npm。

首批组件包括 `Button`、`Checkbox`、`Chip`、`Heading`、`IconButton`、`Input`、`Label`、
`Link`、`Select`、`Tab`、`Tag` 和 `Text`，以及支撑原子组件的 `defineAtom`、默认值类型、
内容类型和 class helper。

## 当前基线

- 新 Mobile UI 原子组件位于 `src/frontend/app/habitat/mobile/ui/atoms`，当前被 Mobile 页面、组件和分子组件使用。
- 原子组件只依赖 `solid-js` 及相对路径；`Button`、`IconButton` 使用 `lucide-solid` 图标。
- CSS 位于 `app/habitat/mobile/ui/styles/atoms.css`，主题变量与页面容器样式仍和博客前端同目录维护。
- `BottomNav`、`PageHeader`、`Field`、`StateMessage`、`TabGroup` 等分子组件不纳入首批包；它们保留在博客应用，后续单独评估。
- 当前仓库有大量前端架构迁移未提交改动。本计划只处理新 atoms 包边界和消费接线，不回退或重排其他迁移工作。

## 包边界

### 纳入

- 原子组件 TSX、公开 Props 类型和必要的无业务工具类型；
- `defineAtom`、`AtomDefaults`、`CompleteAtomOptions`、`AtomContent`、`classNames`；
- 原子组件 CSS、主题变量和 CSS 导出方式；
- Solid.js 运行时适配和包级类型声明；
- 独立的组件类型测试、渲染/交互测试、CSS 构建测试和 package smoke；
- 博客前端从相对路径切换为 workspace 包导入；
- README、使用示例、版本和发布说明。

### 不纳入

- 分子组件和页面容器：`BottomNav`、`PageHeader`、`Field`、`StateMessage`、`TabGroup`；
- 博客路由、文章、taxonomy、API、存储、页面生命周期和业务状态；
- `MobileShell`、博客品牌文案、博客导航数据和页面级主题持久化；
- Desktop UI、React/Vue 适配或跨框架组件抽象；
- 在没有完成 workspace 消费和公共 API 验收前直接发布正式 npm 版本。

## 公共 API 设计

- 包名固定为 `@fluvient-loom/mobile-h5-solid-atoms`。
- `solid-js` 作为 peer dependency；`lucide-solid` 需要评估为 peer dependency 或改为由调用方传入图标，不能无意绑定博客图标选择。
- 组件 Props 不暴露博客领域类型，不引用 `MobileRouteContext`、页面 logic、API 类型或 `app/kernel`。
- CSS 使用包前缀和明确的主题变量；不要求调用方引入博客的 `.mobile-shell` 或 `.m-page-container` 才能正常渲染。
- 根入口只导出稳定的组件和类型；内部 `config`、`define`、`field-context` 是否提供子路径导出，需在 API 评审中确定。
- 组件保持当前可访问性语义、受控值行为、默认 options 合并和响应式 getter 行为。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 包边界与 API 评审 | frontend+qa | - | 本计划、包 manifest、导出表、Props 契约 | ready |
| 原子组件与样式迁移 | frontend | API 评审 | `packages/mobile-h5-solid-atoms/**`、原子 CSS 和构建配置 | ready |
| 博客 workspace 消费切换 | frontend | 包可独立构建 | `src/frontend/**` 的 atoms import、Vite/TS 配置、相关测试 | ready |
| 组件验证与示例 | qa | 消费切换 | 包测试、前端测试、showcase/示例、CSS 验证 | ready |
| npm 发布准备评审 | release+pm | 质量验收 | README、版本策略、publishConfig、变更记录和发布清单 | ready |

包入口、CSS、Solid 编译配置和博客消费接线属于共享写集，必须串行修改。分子组件不得在本计划中为适配包边界而一起迁移。

## 成功标准

1. `@fluvient-loom/mobile-h5-solid-atoms` 在 workspace 中可独立 typecheck、test、build 和 smoke。
2. 包运行时代码只依赖允许的 Solid/UI 依赖，不导入博客 API、路由、页面、存储、`app/habitat/mobile/logic` 或 Desktop 代码。
3. 首批原子组件和公开 Props 类型均从包根入口稳定导出，类型默认值约束和负向类型测试保持有效。
4. 原子组件 CSS 可以由消费者明确引入，主题变量、类名前缀和默认样式在独立示例中可用，不依赖博客页面容器。
5. 博客 Mobile 新运行时已改为消费 workspace 包，现有页面行为、可访问性和视觉基线没有非目标变化。
6. `lucide-solid` 的依赖策略、Solid peer dependency、ESM/类型声明和浏览器支持范围已记录。
7. 完成 `src/frontend` 相关 typecheck、lint、format、组件测试、build 和 `git diff --check`；浏览器验收单独记录实际环境和证据。
8. npm 发布准备评审明确给出 `publish` 或 `继续 workspace-only` 的结论；没有把未完成的发布动作当作计划完成条件。

## 集成验收

1. 在独立包目录运行 typecheck、组件测试、CSS 构建和 package smoke。
2. 使用最小 Solid 示例导入包根入口，渲染全部首批 atoms，检查默认 options、受控输入、事件回调、禁用/加载/校验状态和无障碍属性。
3. 构建博客 Mobile 页面，确认 Vite 产物只包含一份组件实现，页面仍能正常加载和切换。
4. 检查包源码依赖和导出边界，确认没有博客业务导入、平台错误依赖或未声明的裸模块。
5. 对照迁移前后的关键页面截图和交互；发现视觉差异时区分组件包变化与页面迁移变化并记录。
6. 运行前端相关质量检查；浏览器或真实 runtime 受环境限制时，明确记录未完成项，不以构建通过替代浏览器验收。

## 未决项

- 包名是否最终使用 `@fluvient-loom/mobile-h5-solid-atoms`，还是在 API 评审中缩短为 `@fluvient-loom/mobile-atoms-solid`。
- `lucide-solid` 是 peer dependency，还是将 `IconButton` 改为完全由调用方传入 icon。
- CSS 是提供单一 `styles.css`，还是拆分 `atoms.css` 与 `themes.css` 子路径。
- 包采用独立版本，还是与其他 `@fluvient-loom` 包统一版本；首发版本暂不自动决定。
- 首轮完成后是否发布 npm；发布前需确认 npm scope、仓库元数据、license、CI provenance 和变更日志规则。
