---
kind: component-library-guide
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
status: completed
owner: project-manager
last_reviewed: 2026-09-06
write_set: docs/plans/active/PLAN-MOBILE-CSS-ARCHITECTURE-001/COMPONENT-LIBRARY.md
depends_on: [ATOM-CONTRACT.md]
---

# C Mobile 原子组件库

## 状态与范围

这是 C Mobile 原子组件库的调用方契约。第一批 API 已由
[`ATOM-CONTRACT.md`](ATOM-CONTRACT.md) 冻结，独立源码、导出入口和
`atoms.css` 已完成并通过独立验证；batch 2 和首批分子按扩量计划的轮次门禁接入。

组件库只服务 `web/mobile`。Desktop 不得导入、复制或反向约束它；跨端可共享的
仍只有数据语义和无界面契约。文章正文 `.article-body`、页面 layout、Filter Panel、
Shelf、导航、文章卡片和状态块都不属于本库。

第一期的九个原子继续保持 API 稳定；`PLAN-MOBILE-ATOM-EXPANSION-001` 在其上增加五个已核对消费证据的 batch 2 原子和首批三个分子：

| 分类 | 组件 | 解决的问题 | 不解决的问题 |
| --- | --- | --- | --- |
| 排版 | `Text`、`Heading` | 原生文字和标题的尺度、色调、换行与语义。 | 文章摘要截断、日期格式化、标签、页面布局或目录。 |
| 操作与导航 | `Button`、`IconButton`、`Link` | 原生 button/anchor 语义、受控状态、焦点与触控反馈。 | 路由、请求、自动防抖、重试、业务动作或图标库。 |
| 表单 | `Label`、`Input`、`Select`、`Checkbox` | 当前 Filter 已使用的受控原生表单控件。 | 表单读取、校验、提交、跨字段关系或 Filter 的本地状态。 |

| 扩量原子 | `Tag`、`Tab`、`Chip`、`Text` 的 `accent` tone、`Link` 的 `cta` variant | 已存在的标签、Shelf 目录单选、横向筛选胶囊、eyebrow 和主页行动链接视觉。 | 业务数据读取、scrollspy、筛选状态、路由。 |
| 首批分子 | `TabGroup`、`ChipGroup`、`StateMessage` | 受控分组、键盘 roving、状态反馈和可选重试按钮。 | 请求、筛选状态机、路由、滚动定位和错误归一化。 |

`TabGroup` 的 `ariaLabel`、`items`、`selectedId` 和 `onChange` 由调用方提供；方向键在水平/垂直模式下循环并保留 `Home`/`End`。`ChipGroup` 的 `ariaLabel` 与受控单值同样由调用方提供，横向滚动与左右键导航不改变 URL。`StateMessage` 只根据 `kind` 选择稳定图形槽和语义 role，重试回调由业务层传入。

未来的 `FormField`、按钮组、状态块只能作为分子另行立项；不能为方便接入而扩张
原子 API。

## 目录和导入约定

独立实现工作流必须建立下列 C Mobile 专属入口；在入口生成前，任何 import 都是无效
的，不得提前改动消费者。

```text
web/mobile/
  src/atoms/
    index.ts
    text.tsx
    heading.tsx
    button.tsx
    icon-button.tsx
    link.tsx
    label.tsx
    input.tsx
    select.tsx
    checkbox.tsx
  styles/
    atoms.css
```

消费方只从 `src/frontend/mobile-ui/atoms/index.ts` 导入具名组件，不能深度导入单个实现文件：

```tsx
import { Button, Input, Label } from "../atoms";
```

每个原子只有一个稳定根 class，例如 `.m-atom-button`。`atoms.css` 只依赖
`tokens.css` 和 `base.css`，并早于业务组件和页面样式加载。业务、分子和页面模块不得
用祖先选择器覆盖 `.m-atom-*` 的内部规则；需要新视觉时，先判断它是已证明的原子
variant 还是应该归属到业务组件。

## 通用使用规则

- 原子是纯受控 UI：上层传入已经可显示的内容、`value`、`checked`、显示状态和事件回调；
  它们不读取 Client SDK、路由、全局状态或领域对象。
- `options` 是一个显式的、字段全部可选的 `Partial<...Options>` 包。顶层必须传入的
  内容、`href`、`value`、`checked`、`ariaLabel`、`controlId` 和受控更新回调保持必填；
  调用方传 `options: {}` 表示采用默认值。这符合项目的 Props 可选性规则，避免在一个
  Props 对象中散落可选字段。
- 原子不接受 `style` object、任意 `class`、任意原生属性 rest spread、任意颜色或
  `data-*` 样式参数。`aria-*` 只表达无障碍语义，不是样式开关。
- `loading`、`disabled`、`invalid` 是上层给出的显示输入。原子不会启动请求、决定重试、
  管理缓存或变更筛选条件。
- 交互原子必须保留原生键盘行为、至少 `44px` 的自身目标、可见 `:focus-visible`，并且
  状态改变不得改变边框占位、字体度量、外边距、宽高或文档流。
- `Text`、`Heading` 和表单值不承担领域格式化。文章日期、标签、空态文案、错误文案和
  query 语义都应在业务组件或页面层完成后再传入。

## 类型即契约

组件库的配置防线只有 TypeScript 一道（2026-09-06 起不再有运行时配置校验，也不再有
`C Mobile atom:` 抛错）。会破坏原生语义、受控协议或可访问名称的配置错误在调用点被
**编译拒绝**；可默认的 `options` 字段由 `defineAtom` 在渲染前合并进 `defaults`。

| 编译期拒绝的用法 | 依据 |
| --- | --- |
| `Button` 传 `href`、`Select` 传业务数据源等超出契约的字段 | `XxxProps` 只声明契约内字段，对象字面量多写字段即报错。 |
| `variant: "ghost"`、`tone: "disabled"`、`size: "display"` 等非法枚举值 | `XxxOptions` 的枚举字段是字面量联合。 |
| 缺少 `content`、`href`、`value`、`checked`、`ariaLabel`、`controlId` 或受控回调 | 这些字段在 `XxxProps` 顶层必填。 |
| `Input` 选择非 `date` 类型、`Select` 声明 `multiple` 等 | 组件固定原生形态，类型上根本不存在这些字段。 |

合法与非法样例固定在 `mobile-ui/atoms/types.test.ts`：每条非法用法都写成
`@ts-expect-error`，有人放宽类型时 typecheck 会因"未使用的指令"变红；运行时部分只断言
`defaults` 合并。

因此这些情况**不再有防线**，由调用方自律：JavaScript 调用方、`any`/不安全断言、运行时
拼装出来的 Props，以及空字符串或 `null` 的 `content`/`icon`。`Link` 的
`target="_blank"` 需要 `rel` 显式包含 `noopener noreferrer`；组件既不校验也不自动补写。

`Button` 的 `onClick` 可以缺省，因为原生 submit/reset button 可以没有点击回调；这不属于
受控值协议。被 `disabled` 或 `loading` 的 Button 也必须保持原生不可激活，而不是用回调中
的静默 return 假装禁用。

## 组件索引

### Text

`Text` 只输出 `<span>` 或 `<p>`，用于正文和次要文本。它不截断、复制或格式化内容。

```tsx
<Text content={articleSummary} options={{ as: "p", tone: "muted", size: "body" }} />
```

`as` 决定 HTML 语义；`tone` 只允许 `default` 或 `muted`；`size` 只允许 `body` 或
`meta`。长词必须允许换行，完整文本可选择且可按用户设置缩放。

### Heading

`Heading` 输出 `<h1>`、`<h2>` 或 `<h3>`。调用方负责选择正确的文档层级，组件不会
自动推导层级、生成锚点或提供折叠能力。

```tsx
<Heading content={sectionTitle} options={{ as: "h2", size: "section" }} />
```

`size` 只允许 `page`、`section`、`card`。排版大小不能取代语义等级。

### Button

`Button` 始终输出原生 `<button>`，用于动作而非导航。`type` 默认归一化为 `button`，
避免将来放进表单时误提交。`state: "loading"` 与 `state: "disabled"` 都映射到原生
`disabled`；loading 同时暴露 `aria-busy="true"`，并保持稳定的可访问名称。

```tsx
<Button
  content="查看结果"
  options={{
    type: "button",
    variant: "primary",
    width: "block",
    state: "enabled",
    onClick: applyFilter,
  }}
/>
```

可用 variant 为 `primary`、`secondary`；可用 width 为 `content`、`block`。不提供
`href`、路由导航、提交请求、自动防抖或重试。

### IconButton

`IconButton` 也是原生 `<button>`，但没有可见文字。`ariaLabel` 必须是非空可访问名称；
图标内容由调用方提供且在实现中标记为 `aria-hidden`。本库不选择或导出图标库。

```tsx
<IconButton
  icon={<CloseIcon />}
  ariaLabel="关闭筛选"
  options={{ variant: "secondary", state: "enabled", onClick: close }}
/>
```

它支持与 `Button` 相同的受控 loading/disabled 语义，不承担 Dialog 的关闭、焦点恢复或
滚动锁定。

### Link

`Link` 始终输出 `<a href>`，用于真实导航；它不会改写浏览器 history 或读取路由。
`href` 为必填项。`target: "_blank"` 时必须由调用方传入含 `noopener noreferrer` 的
`rel`：类型不表达该组合，实现也不校验或自动补写。

```tsx
<Link content="浏览全部文章" href="/m/articles/index.html" options={{ variant: "action" }} />
```

可用 variant 为 `inline`、`action`。不可把 Link 用作 disabled Button，不能用 Button
伪装链接。

### Label

`Label` 输出明确关联的 `<label for>`，`controlId` 为必填项。第一期只处理标签本身；
“标签 + 控件 + 帮助文字 + 错误文字”的结构属于未来 `FormField` 分子。

```tsx
<Label content="创建起始" controlId="created-from" options={{}} />
```

Label 内不得嵌套可点击交互元素。

### Input

`Input` 第一阶段固定输出 `<input type="date">`。它采用受控 `value` 和 `onInput`，
没有文本、搜索、密码、数字、文件、掩码、日期解析或自动完成能力。

```tsx
<Input
  value={createdFrom()}
  onInput={updateCreatedFrom}
  options={{ id: "created-from", validation: "valid" }}
/>
```

`state: "disabled"` 映射原生 `disabled`；`validation: "invalid"` 映射
`aria-invalid="true"`。上层提供错误/帮助文字后，使用 `describedById` 建立关联。

### Select

`Select` 输出原生受控 `<select>`，选项由调用方提供的原生 `<option>` 内容组成。
它不读取文章类型数据，也不提供多选、搜索或虚拟列表。

```tsx
<Select
  content={
    <>
      <option value="">全部类型</option>
      <For each={articleTypes()}>
        {(articleType) => <option value={articleType.id}>{articleType.name}</option>}
      </For>
    </>
  }
  value={typeId()}
  onChange={updateTypeId}
  options={{ id: "article-type" }}
/>
```

实现采用契约的 `content` Props，不提供未声明的 children API。

### Checkbox

`Checkbox` 输出原生 `<input type="checkbox">`，采用受控 `checked` 和 `onChange`。
它不持有 group、半选或校验规则，且必须由 `Label` 或其他明确方式获得可访问名称。

```tsx
<Checkbox
  checked={selectedTermIds().includes(termId)}
  onChange={updateTermSelection}
  options={{ id: `term-${termId}` }}
/>
```

`state`、`validation` 和 `describedById` 的含义与 `Input`、`Select` 相同。

## 状态与可访问性矩阵

| 状态 | Button / IconButton | Input / Select / Checkbox | Link / 排版 |
| --- | --- | --- | --- |
| enabled | 保留原生激活与键盘行为。 | 保留受控编辑/选择行为。 | 无额外状态。 |
| disabled | 原生 `disabled`；点击和键盘激活都不触发回调。 | 原生 `disabled`。 | Link 不模拟 disabled；上层选择不渲染或使用 Button。 |
| loading | 原生 `disabled` + `aria-busy="true"`；名称保持可理解。 | 第一期不提供 loading。 | 第一期不提供 loading。 |
| invalid | 第一期不适用。 | `aria-invalid="true"`，错误文字由上层提供并以 `aria-describedby` 关联。 | 第一期不适用。 |
| focus | 清晰 focus-visible，不改变几何。 | 清晰 focus-visible，不改变几何。 | Link 与排版保持各自原生语义。 |

## 实现、验证与接入顺序

实现任务开始前，必须同时满足：`ATOM-CONTRACT.md`、样式 inventory 与本文件已获 PM
审定；实现任务只创建原子目录、原子 CSS、导出与独立验证，不修改现有页面或业务组件。

原子库实现完成后，先验证 DOM 语义、受控状态、键盘行为、依赖边界、44px/焦点/文字缩放
与窄屏无溢出，再复跑可用质量门禁。当前总项目门禁存在无关的构建、类型、lint、format
问题时，必须逐项和 PM 基线比较，不能以既有失败掩盖新增回归。

只有原子库完成独立验证且 `REGRESSION-BASELINE.md` 的接入 gate 可执行后，PM 才能批准
单独的消费迁移任务。接入顺序不可跳过：原子 -> 分子（有稳定重复证据时）-> 业务组件 ->
页面。每次只迁移一个稳定边界；Filter、Shelf、导航和详情页不能在同一次改动中同时作为
组件库验证目标。

## 关联文档

- [`ATOM-CONTRACT.md`](ATOM-CONTRACT.md)：精确 Props 方向、原生属性映射、禁止项和实现验证。
- [`STYLE-INVENTORY.md`](STYLE-INVENTORY.md)：现有 class/selector 的归属和 `atoms.css` 的最终模块位置。
- [`REGRESSION-BASELINE.md`](REGRESSION-BASELINE.md)：页面回归场景、视口和人工验收边界。
- [`PM-STATUS.md`](PM-STATUS.md)：当前范围、质量基线、工作流状态和接入门槛。
