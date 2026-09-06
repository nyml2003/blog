---
kind: plan
id: PLAN-MOBILE-CSS-ARCHITECTURE-001
status: in_progress
owner: project-manager
created: 2026-09-05
last_reviewed: 2026-09-05
coordinates_with: [PLAN-MOBILE-DENSITY-002]
---

# C Mobile CSS 正交化

## 目标

重构 C Mobile 的样式组织和 class 职责，拆开当前混在同一文件中的基础 token、页面壳、布局、组件、状态、Filter、Shelf、详情页和文章 HTML 主题。让一个 CSS 类表达一个稳定职责，减少页面场景之间互相覆盖和修改时的认知负担。

## 成功标准

- 不再把所有移动端样式维护在单一 `web/mobile/styles.css`；
- 全局 token、reset/base、布局、共享组件、页面局部样式、状态样式和文章 HTML 主题有明确模块边界；
- class 按角色组织：结构/布局、组件、状态 modifier、内容主题互不承担对方职责；
- Filter、Shelf、详情页和文章正文样式可以独立定位与修改；
- 不依赖深层 DOM 选择器或页面名覆盖通用组件样式；
- 现有 Mobile 功能、触控尺寸、焦点管理、滚动锁定、状态反馈和无横向滚动不回归；
- 为 `PLAN-MOBILE-DENSITY-002` 提供可独立迭代的详情页和 HTML 正文样式入口；
- 没有为了“抽文件”制造无意义的 class、过度 BEM 命名或重复 token。
- 建立只覆盖当前已使用场景的 C Mobile 原子组件层；其中每个原子都有明确语义、状态、可访问性和样式所有权，但不预建未经证明的通用组件。

## 非目标

- 不合并 Desktop 和 Mobile CSS；
- 不重做视觉主题或顺带实现 002 的详情页密度方案；
- 不引入 CSS-in-JS、Tailwind、第三方 UI/CSS 框架或复杂构建工具；
- 不强制所有元素拥有 class；
- 不改变文章 HTML 语义或允许文章自定义 CSS。

## 已确认的样式边界

```text
web/mobile/styles/
  tokens.css       颜色、字号、间距、层级、安全区等语义 token
  base.css         reset、全局元素、可访问性基础规则
  shell.css        mobile shell、Header、BottomNav、页面主容器
  layout.css       可复用布局原语，不承载页面业务语义
  atoms.css        Text、Heading、Button、Link 和表单原子的独占样式
  components.css   ArticleRow、StateMessage 等业务共享组件
  shelf.css        Shelf、分区索引和文章库扫描结构
  filter.css       Filter trigger、backdrop、bottom panel、表单
  detail.css       仅详情页外围结构、导航和元数据
  article-body.css 系统渲染 HTML 正文的主题规则
  pages.css        无法归属到以上模块的轻量页面局部规则
```

文件拆分是建议结构而非机械目标；最终以职责清楚、依赖方向单向为准。

## class 规则

- 布局 class 只负责排列、间距和容器，不定义文章/筛选等业务视觉；
- 组件 root class 负责组件外观和内部稳定结构；
- 状态使用明确 modifier，例如 `.is-active`、`.is-loading`、`.has-error`，不通过父页面选择器隐式改变组件；
- 页面 class 只负责该页面特有结构，不覆盖通用组件的内部规则；
- 文章 HTML 使用 `.article-body` 及其受控语义子元素，不能依赖作者自定义 class；
- token 只在 token 文件定义，业务模块使用语义 token，不散落原始色值；
- 优先单层 class 选择器，深层选择器只用于受控文章 HTML 或明确组件内部结构。

## 原子、分子与业务组件规则

- 组件体系只服务 C Mobile，不成为 Desktop/Mobile 共享 UI 层；共享范围仍限于 token 命名、数据语义和无界面契约。
- 原子是最小的、独立可访问的 UI 语义，不包含领域文案、页面布局、数据读取或跨区域编排。第一期只实现当前已使用的 `Text`、`Heading`、`Button`、`IconButton`、`Link`、`Label`、`Input`、`Select` 和 `Checkbox` 原子。
- 分子只组合原子并提供稳定的局部交互或结构，例如带标签的表单字段、按钮组和状态块；其是否进入第二期由原子落地后的实际重复证明决定。
- Shelf、Filter Panel、文章条目、导航和阅读页属于业务组件或页面结构，不得在第一期以“基础组件”名义迁移。它们只能开始消费已稳定的原子。
- 每个原子必须声明 root class、受控状态 modifier、语义 HTML、键盘焦点、触控目标和错误/加载/禁用边界；CSS 只由原子模块拥有。
- 原子是受控 UI：不得发起请求、读取 Client SDK、读取路由或全局状态、保存缓存、管理重试/取消/并发，或承载领域状态机。它们只接收可渲染的 Props 和事件回调。
- 数据读取、请求、异步生命周期、取消、重试、错误归一化和资源状态由 `PLAN-CLIENT-SDK-001` 的 Data SDK、业务 Client SDK 和 Solid adapter 分层承担；业务组件把这些已归一化状态映射为原子 Props。
- 单次使用且不具备稳定交互契约的结构保留在页面局部 CSS；文章 HTML 保留为 `.article-body` 主题边界，不进入组件库。

## 样式实现硬约束

- 所有视觉样式、布局变化、交互状态和响应式变化原则上通过 CSS class、modifier class 或语义属性选择器解决；
- 禁止 CSS-in-JS、组件内 style object、运行时拼接 CSS 字符串和组件内注入 `<style>`；
- Solid 组件只负责切换 class/属性，不直接承载样式定义；
- 禁止通过 DOM `data-*` 属性传递业务数据、运行时状态或样式参数；
- `aria-*` 只用于可访问性语义，不作为样式或业务数据通道；测试定位标记如确有需要必须单独约定，不能承载业务值；
- 动态值只有在确实无法由 class 表达时，才允许通过受控 CSS custom property 传递；custom property 的定义仍必须由 CSS 模块声明，不能成为 CSS-in-JS 逃生口；
- class 命名和状态切换必须表达稳定语义，例如 `.is-active`、`.is-loading`、`.has-error`，不得使用无法解释的数值或实现细节命名。

## 与 002 的协调

`PLAN-MOBILE-DENSITY-002` 的详情页和正文 CSS 实现写集与本计划重叠。执行顺序为：

```text
CSS 审计与模块边界
  -> CSS 拆分迁移与视觉回归
  -> 详情页信息密度 002 的具体 CSS 改造
```

在 CSS 架构计划完成前，002 可以继续进行视觉审计和产品决策，但不应并行修改 `web/mobile/styles.css` 或未来拆分后的同一模块。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 视觉/前端：样式依赖审计与模块方案 | visual-design + frontend-mobile | - | `docs/architecture/ui-ux.md`, 本计划审计文档 | completed |
| 前端：独立原子组件库 | frontend-mobile | 审计方案 | `web/mobile/src/atoms/**`, `web/mobile/styles/atoms.css` | completed |
| 前端：CSS 文件与 class 迁移 | frontend-mobile | 审计方案、独立原子库 | `web/mobile/styles.css`, 除原子目录外的 `web/mobile/**/*.css`, 现有 Mobile JSX class | ready |
| 测试：视觉与交互回归 | frontend-mobile | 迁移 | Mobile 测试、验收记录 | ready |
| 项目管理：写集协调与验收 | project-manager | 全部工作流 | 计划、结果、状态记录 | ready |

项目经理启动提示见同目录的 `PM-PROMPT.md`。

## 文档交接包

本计划的审计、原子库和后续执行文档已完成，可以交给下一位 PM 或实施负责人；交接入口为
[`HANDOVER.md`](HANDOVER.md)。它索引每个已审定结论、仍为 `ready` 的工作流、唯一 write set、
质量证据和恢复执行顺序。

本次交接**不表示** CSS 模块迁移、视觉回归或页面原子接入已完成。它们分别仍由
`WORKSTREAM-MOBILE-CSS-MIGRATION` 和 `WORKSTREAM-MOBILE-CSS-TESTING` 承担，且必须先满足
[`MIGRATION-RUNBOOK.md`](MIGRATION-RUNBOOK.md) 与
[`REGRESSION-BASELINE.md`](REGRESSION-BASELINE.md) 的开工 gate。

## 集成验收

1. 建立当前 CSS class -> 页面/组件 -> 样式模块的 inventory。
2. 对每个目标模块说明职责、允许依赖和禁止承担的职责。
3. 拆分后构建通过，页面不丢失样式，不出现选择器优先级回归。
4. 在窄屏与常见手机视口检查首页、文章库、Filter Panel、详情页、加载/空/错状态。
5. 验证 Filter 的焦点管理和滚动锁定、Shelf sticky 行为、底部导航安全区和文章 HTML 溢出。
6. 详情页 CSS 可以由 002 独立修改，无需搜索无关 Filter/Shelf 样式。

## 未决项

- 是否使用 CSS Cascade Layer，由审计结果决定；不作为默认要求；
- class 命名是否采用统一前缀，由迁移成本和现有命名一致性决定；
- 是否进一步抽取共用 component CSS 到 Desktop/Mobile 共享层，默认不做。
