---
kind: mobile-atom-contract
plan_id: PLAN-MOBILE-CSS-ARCHITECTURE-001
status: approved
owner: frontend-mobile
last_reviewed: 2026-09-06
write_set: docs/plans/active/PLAN-MOBILE-CSS-ARCHITECTURE-001/ATOM-CONTRACT.md
---

# C Mobile 第一批原子组件契约

## 目的与生效边界

本文件冻结 C Mobile 第一批原子组件的实现与消费方向。契约制订阶段只修改本文档；独立原子实现现已完成，但它不是当前页面的迁移说明，`FilterPanel`、`Shelf`、`StateMessage`、导航和页面仍不消费原子。

范围只包含当前被证明存在的原生排版、链接、按钮和筛选表单语义：`Text`、`Heading`、`Button`、`IconButton`、`Link`、`Label`、`Input`、`Select`、`Checkbox`。组件只服务 C Mobile；Desktop 不能导入、复制或反向约束本实现。

原子的职责是把稳定的原生控件语义、受控显示状态和自身样式收敛到一个入口。它们不重定义业务结构，也不替代页面或业务组件的 DOM。

## 分层和禁止依赖

```text
Data SDK -> Client SDK -> Solid resource adapter -> business component -> molecule -> atom
                                                         props/events ----^
```

| 层级 | 可包含 | 本期结论 |
| --- | --- | --- |
| 原子 | 单一原生语义、受控视觉状态、键盘与无障碍属性 | 本文件定义的九项。 |
| 分子 | 原子组合出的稳定局部结构，例如 FormField、ButtonGroup | 不建设；`Label + Input/Select/Checkbox` 的布局和错误提示仍待重复用例证明。 |
| 业务组件 | `FilterPanel`、`ShelfIndex`、`ArticleRow`、`StateMessage`、导航 | 保持现状；只可在后续消费稳定原子，不能反向拥有原子样式或 API。 |
| 页面和内容主题 | 路由场景、数据状态、`ArticleBody`、`.article-body` | 不是组件库成员。 |

所有原子必须遵守下列依赖禁止项：

- 不导入 Client SDK、Transport、Solid resource adapter、路由、全局状态、业务领域类型或业务组件；
- 不读取数据、不发起请求、不缓存、不轮询、不做取消/超时/重试/并发协调，也不持有领域状态机；
- 不格式化文章日期、标签、筛选条件或其他领域文案；上层传入已经可显示的内容、`value`、`checked`、状态和回调；
- 不用 `data-*` 传业务值或样式参数，不以 `aria-*` 承载样式状态；不接受 `style` object、运行时 CSS 字符串、任意颜色、任意 class 或任意原生属性透传；
- 不通过页面祖先选择器取得外观，不依赖分子、业务、页面、Shelf、Filter、详情或 `.article-body` CSS。

`loading`、`disabled`、`invalid` 都是上层已归一化的显示输入。它们不是原子自行开始或结束的异步流程；请求失败文案、重试策略和加载时机由 adapter 或业务组件决定。

## TypeScript Props 约定

项目 TypeScript 规则要求一个 Props 对象的可选性有整体语义，不能把必填和任意可选字段混在一个未说明的对象里。第一期实现采用以下形状：每个公开原子都接收一个**完整的必填 Props 对象**。缺失就会破坏原生语义、可访问名称、控件关联或受控状态协议的字段必须在顶层必填；只有可默认的显示与原生选项才放进名称明确且字段全部可选的 `Partial<...Options>`。调用方必须传 `options: {}`，而不是依赖散落的可选顶层字段。

```ts
type AtomContent = JSX.Element;

type ButtonProps = {
  content: AtomContent;
  options: Partial<ButtonOptions>;
};
```

这是组件公共协议的有意边界，不是绕过类型规则的例外。它的好处是：内容、必要关联和受控回调始终存在；可默认的视觉/状态/非必要原生能力统一归入同一个 `Partial` 选项包；以后新增选项不会把不透明的可选字段扩散到顶层。组件内部把 `options` 归一化为完整的渲染模型，再渲染原生元素。

以下类型为精确的实现方向。`JSX.Element` 可替换为项目中实际使用的 Solid JSX 内容类型，但不得把 `string`、领域对象或 `unknown` 当作无约束内容入口。

```ts
type TextTone = "default" | "muted";
type TextSize = "body" | "meta";
type TextOptions = {
  as: "span" | "p";
  tone: TextTone;
  size: TextSize;
  id: string;
};
type TextProps = {
  content: JSX.Element;
  options: Partial<TextOptions>;
};

type HeadingAs = "h1" | "h2" | "h3";
type HeadingSize = "page" | "section" | "card";
type HeadingOptions = {
  as: HeadingAs;
  size: HeadingSize;
  id: string;
};
type HeadingProps = {
  content: JSX.Element;
  options: Partial<HeadingOptions>;
};

type ControlState = "enabled" | "disabled" | "loading";
type ButtonVariant = "primary" | "secondary";
type ButtonOptions = {
  type: "button" | "submit" | "reset";
  variant: ButtonVariant;
  width: "content" | "block";
  state: ControlState;
  id: string;
  name: string;
  onClick: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => void;
};
type ButtonProps = {
  content: JSX.Element;
  options: Partial<ButtonOptions>;
};

type IconButtonOptions = {
  variant: ButtonVariant;
  state: ControlState;
  id: string;
  onClick: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => void;
};
type IconButtonProps = {
  ariaLabel: string;
  icon: JSX.Element;
  options: Partial<IconButtonOptions>;
};

type LinkVariant = "inline" | "action";
type LinkTarget = "_self" | "_blank";
type LinkOptions = {
  variant: LinkVariant;
  target: LinkTarget;
  rel: string;
  id: string;
  ariaCurrent: "page" | "step" | "location" | "date" | "time" | "true";
  onClick: (event: MouseEvent & { currentTarget: HTMLAnchorElement }) => void;
};
type LinkProps = {
  content: JSX.Element;
  href: string;
  options: Partial<LinkOptions>;
};

type LabelOptions = {
  id: string;
};
type LabelProps = {
  content: JSX.Element;
  controlId: string;
  options: Partial<LabelOptions>;
};

type ValidationState = "valid" | "invalid";
type InputOptions = {
  id: string;
  name: string;
  state: "enabled" | "disabled";
  validation: ValidationState;
  describedById: string;
};
type InputProps = {
  onInput: (event: InputEvent & { currentTarget: HTMLInputElement }) => void;
  value: string;
  options: Partial<InputOptions>;
};

type SelectOptions = {
  id: string;
  name: string;
  state: "enabled" | "disabled";
  validation: ValidationState;
  describedById: string;
};
type SelectProps = {
  content: JSX.Element;
  onChange: (event: Event & { currentTarget: HTMLSelectElement }) => void;
  value: string;
  options: Partial<SelectOptions>;
};

type CheckboxOptions = {
  id: string;
  name: string;
  state: "enabled" | "disabled";
  validation: ValidationState;
  describedById: string;
};
type CheckboxProps = {
  checked: boolean;
  onChange: (event: Event & { currentTarget: HTMLInputElement }) => void;
  options: Partial<CheckboxOptions>;
};
```

实现前应由 frontend-mobile 用当前 Solid 的 DOM 类型验证事件签名；若 `InputEvent` 与 Solid JSX 的事件泛型不完全相同，只能在原子内部适配，不能把 `Event` 或 `unknown` 向上扩散。`id`、`name` 与 `describedById` 在当前实现中可省略的情形，通过不提供对应 `Partial` 键表达；它们绝不能被 `null` 表达。`ariaLabel`、`controlId`、`onInput`、Select 的 `content/onChange` 与 Checkbox 的 `onChange` 不可省略。

### 类型即契约

2026-09-06 起放弃全环境运行时配置校验：TypeScript 的 strict 字面量联合与必填字段是原子的**唯一**配置防线。每个原子在渲染前只做一件运行时的事——由 `mobile-ui/atoms/define.ts` 的 `defineAtom` 把 `Partial<XxxOptions>` 与 `defaults` 合并成完整渲染模型；render 内没有校验，也没有 `?? 默认值`。

防线由三层构成：

1. **Props 类型**：`XxxOptions` 的枚举字段是字面量联合；`XxxProps` 的 `content`、`href`、`value`、`checked`、`ariaLabel`、`controlId` 与受控回调保持顶层必填；`options` 是字段全部可选的 `Partial`。超出契约的字段（如 `Button` 传 `href`）与非契约字面量（如 `variant: "ghost"`）在调用点直接编译失败。
2. **defaults 编译期锚定**：`defaults` 用 `as const satisfies AtomDefaults<XxxProps>` 声明，必须逐字覆盖 options 的全部字段。新增 option 字段而不给默认值会编译失败；给非法字面量同样编译失败。可省略的 DOM 属性（`id`、`name`、`describedById`、`rel`、`ariaCurrent`、受控回调）在 defaults 中显式取 `undefined`，组件不为它们制造空字符串或空属性。
3. **负样例类型测试**：`mobile-ui/atoms/types.test.ts` 为每个原子提供合法受控组合与 `@ts-expect-error` 非法用法。`@ts-expect-error` 是"此处必须报错"的承诺：一旦有人放宽 Props 类型，typecheck 会因"未使用的指令"变红。运行时部分只断言 defaults 合并行为。

明确放弃的运行时防线（这些输入仍会穿过类型系统，且不再抛出 `C Mobile atom:` 异常）：

| 穿透通道 | 后果 |
| --- | --- |
| JavaScript 调用方、`any`、不安全断言 | 缺失或错误类型的配置不再抛出；可能渲染出缺失语义的 DOM，或由原生行为自行失败。 |
| 运行时组装的 Props（对象拼接、解构重组） | 类型检查无法覆盖非字面量调用点，同上。 |
| 空字符串、`false`、`null` 等可渲染但为空的内容 | `AtomContent` 即 `JSX.Element`，空内容会渲染为空节点，不再被拒绝。 |
| `target: "_blank"` 未显式提供含 `noopener noreferrer` 的 `rel` | 不再抛出，也不会自动补写；`rel: string` 无法在类型上表达 token 组合，由调用方保证。 |

本节只讨论组件**配置**。业务请求失败、资源 loading、服务端字段校验、筛选业务规则、提交失败、重试与取消仍由 Data SDK、Client SDK、Solid adapter 或业务组件以其既定状态/错误模型处理；原子不得把它们转换成配置异常，也不得在原子内抛出它们。

### Props 选择说明

- `Text` 只提供已证明的正文/次要文字与 `span`/`p` 语义。`eyebrow`、文章摘要截断、标签、日期和元数据布局仍是业务或页面样式，不伪装成任意排版原子。
- `Heading` 只允许现有的 `h1`、`h2`、`h3`。`as` 决定文档语义，`size` 只选择已出现的页面/区块/卡片文本尺度；它不自动推导层级，不实现折叠、锚点或目录。
- `Button` 明确支持当前页面已有的实心主操作和透明边框次操作。`width` 是组件自身的非业务呈现，不承载容器栅格或外边距。`type` 默认必须在实现中归一化为 `button`，避免嵌入未来表单时意外提交。
- `IconButton` 是无可见文字的 `<button>`；`ariaLabel` 在可访问名称上是必填项，`icon` 由调用方提供。第一期不选定图标库、不把 Unicode 图形和动作语义内置到组件。
- `Link` 始终渲染 `<a>`，`href` 是必填字段。`target: "_blank"` 时调用方必须显式提供包含 `noopener noreferrer` 的 `rel`；缺失即为配置错误，不自动补写。有历史回退等局部行为时，业务或页面通过 `onClick` 处理，Link 不读取路由或 history。
- `Label` 的第一期采用显式 `for` 关联：`controlId` 必填，组件将其映射为原生 `for`/`htmlFor`。当前 `FilterPanel` 的嵌套 label 由后续 `FormField` 分子决定是否保留；原子层不承担“文字 + 控件 + 帮助/错误提示”的布局。
- `Input` 固定渲染 `<input type="date">`，因为当前唯一的文本输入用例是四个日期筛选控件。`value` 与 `onInput` 构成受控值协议；不预建文本、密码、搜索、数字、文件、自动完成、掩码或日期解析能力。
- `Select` 固定受控 `value`/`onChange`，选项由 `content` 提供的原生 `<option>` 构成。它不读取文章类型数据，也不实现多选、搜索或虚拟列表。
- `Checkbox` 固定渲染 `<input type="checkbox">`，`checked` 与 `onChange` 构成受控布尔协议。标签关联由 `Label` 或未来 `FormField` 完成；它不自行管理 checkbox group、半选或校验规则。

## 原生语义、状态和可访问性

| 原子 | 原生输出与受控状态 | 必须具备的无障碍行为 |
| --- | --- | --- |
| `Text` | `span` 或 `p`；不带交互状态 | 文本保持可选择和缩放；长词可以换行，不能由原子截断内容。 |
| `Heading` | `h1`、`h2` 或 `h3`；无交互状态 | 正确层级由调用方决定；不可把普通 `div` 或 `span` 伪装为 heading。 |
| `Button` | `<button>`；`enabled`、`disabled`、`loading` | `disabled/loading` 映射原生 `disabled`；loading 同时以 `aria-busy="true"` 暴露且阻止重复激活；保留稳定文字或等价可访问名称。 |
| `IconButton` | `<button>`；`enabled`、`disabled`、`loading` | `aria-label` 必须非空；图标节点 `aria-hidden`；同 Button 的 disabled/loading 行为。 |
| `Link` | `<a href>`；非激活样式不伪装为 disabled | 可见文本或等价可访问名称；只在当前页面/位置时使用 `aria-current`；不能用 Button 替代导航。 |
| `Label` | `<label for>` | `controlId` 必须指向同一文档内的实际控件 ID；Label 不接受可点击的嵌套交互元素。 |
| `Input` | `<input type="date">`；`enabled/disabled`、`valid/invalid` | 受控 `value`；invalid 映射 `aria-invalid="true"`；有帮助或错误文本时通过 `aria-describedby` 关联，不能只用颜色表示。 |
| `Select` | `<select>`；`enabled/disabled`、`valid/invalid` | 受控 `value`；原生 option 保持键盘选择；invalid/description 同 Input。 |
| `Checkbox` | `<input type="checkbox">`；`enabled/disabled`、`valid/invalid` | 受控 `checked`；必须有可见 Label 或其他可访问名称；invalid/description 同 Input。 |

所有交互原子在自身的可点击盒内达到至少 `44px` 高和宽，且相邻互动目标由使用场景保留至少 `8px` 间距。`focus-visible` 必须明确、足够对比且不造成几何变化。`:active`、focus、loading、disabled、invalid 均只能改变颜色、轮廓、填充或预留槽位，不能改变 border 宽度、字体度量、外边距、宽高或文档流。

按钮和表单控件不以颜色单独表达状态：loading 有 `aria-busy` 与稳定名称，disabled 有原生语义，invalid 有 `aria-invalid` 与由上层传入且关联的文字说明。动效遵守当前全局 `prefers-reduced-motion` 规则；原子本身不强制加入新的动画。

## CSS 所有权和 token 依赖

实现时为原子建立独占的 `src/frontend/mobile-ui/styles/atoms.css`（或在最终模块图中同等明确、仅由原子拥有的子模块）。该文件只能依赖 `tokens.css` 和 `base.css`；它不读取 shell、layout、filter、shelf、detail、pages、业务组件或文章主题样式。该文件的引入顺序在最终 CSS 审计后冻结，但必须早于业务组件和页面模块。

| CSS 契约 | 要求 |
| --- | --- |
| 根 class | 每个原子有稳定根 class，例如 `.m-atom-button`、`.m-atom-link`；只由该原子模块定义和修改。 |
| modifier | 使用 `.is-loading`、`.is-invalid`、`.is-block` 等受控 modifier；不能用页面 class 或任意 `data-*` 驱动。 |
| 结构 | 原子内允许的子元素只用于稳定的图标、可访问 loading 说明或视觉槽位；不渲染业务容器或页面间距。 |
| token | 只使用语义 token。当前可复用色彩语义为 `--ink`、`--muted`、`--border`、`--blue`、`--danger`；缺少的尺寸/焦点/圆角 token 必须先在 tokens 审计中命名，不能散落裸值。 |
| 布局 | 不拥有页面外边距、Shelf 栅格、Filter Panel sticky、阅读栏、安全区或正文宽度；`Button` 的 `block` 仅影响自身行内宽度。 |
| 覆盖 | 业务和页面模块不得通过 `.page .m-atom-*` 或标签深层选择器改写原子内部外观。需要业务外观时，先证明新的原子 variant 或业务组件边界。 |

当前 `PLAN.md` 的模块草案把按钮置于 `components.css`。原子实现开始前，PM 必须以样式 inventory 审定 `atoms.css` 是独立文件还是 `components.css` 的明确原子子模块；无论文件名如何，以上所有权和单向依赖规则不变。

## 当前用例证据

| 证据位置 | 可抽取的原生语义 | 对原子契约的影响 |
| --- | --- | --- |
| `web/mobile/src/pages/home.tsx:27-30`、`web/mobile/src/pages/detail.tsx:73-79` | `p`、`h1`、可选摘要 | `Text`/`Heading` 需要 p/span、h1-h3 与长文本不溢出的基础；摘要是否存在仍由页面决定。 |
| `web/mobile/src/components/ui.tsx:64-82`、`115-129` | 文章条目和卡片是整块 `<a>` | `Link` 必须保持锚点导航语义；ArticleRow/ShelfCard 的布局和截断不进入原子。 |
| `web/mobile/src/pages/home.tsx:58-60`、`web/mobile/src/pages/articles.tsx:152-159` | 主页操作是 `<a>`，筛选触发是 `<button>` | 不能因外观相近合并 Link/Button；Filter trigger 是业务动作，不是通用 atom variant 的依据。 |
| `web/mobile/src/components/ui.tsx:94-105`、`245-253`、`323-340` | section 选择、关闭、清除、提交均为 `<button>` | Button 支持显式原生 type、主/次视觉和 onClick；关闭属于 IconButton 的已证明使用。 |
| `web/mobile/src/components/ui.tsx:255-320` | 一个受控 select、多个受控 date input、多个受控 checkbox | Input 只做 `date`；Select/Checkbox 受控；Filter 本地 signal、清除与提交都留在业务组件。 |
| `web/mobile/src/components/ui.tsx:199-227`、`237-253` | Filter 管理焦点、Escape、滚动锁定和对话框语义 | 这些是 FilterPanel 的非标交互，不迁入 Button/IconButton/Label。 |
| `web/mobile/styles.css:24-32`、`357-428`、`647-700` | 已有原生 reset、主/次按钮、form 控件、focus-visible、44px 目标 | 原子沿用这些已证明的基础，但迁移后其根样式应移入原子 CSS；焦点和几何要求不能回归。 |
| `docs/architecture/ui-ux.md` 的“组件边界”“交互原则” | C Mobile 与 Desktop 隔离；触控目标至少 44px、焦点清晰 | 禁止平台共享 UI，且上表的 a11y/尺寸要求是验收条件。 |

## 明确非目标

- 不实现 `FormField`、`Fieldset`、`Legend`、`Option`、`Radio`、`Switch`、`Textarea`、`Search`、`NumberInput`、`DatePicker`、`Tooltip`、`Popover`、`Dialog`、`Menu`、`Tabs`、`Pagination`、`Spinner` 或图标库；
- 不把 `StateMessage` 的 loading/empty/error、Filter Panel、Shelf scrollspy、文章卡片、导航、阅读返回、日期格式化和文章正文抽成“基础组件”；
- 不提供 `as` 任意标签、多态 Button/Link、`href` Button、路由 Link、自动防抖、请求/提交、表单校验、表单提交、自动 label/error 组合、全局主题切换或 CSS 自定义；
- 不实现 Web Components、HTML 编辑器原子单位、文章 HTML allowlist、sanitization 或内容组件；`.article-body` 仍是独立的系统主题边界；
- 不为了预留扩展而接纳未证明的变量尺寸、颜色、图标名称、原生属性 rest spread 或数据读取能力。

## 实现前后的静态与行为验证

本文件本身不修改源代码，因此当前不以全项目 TypeScript 绿灯作为原子完成的证据。原子独立实现 PR 必须至少提供下列证据：

1. `pnpm --dir web typecheck`、`pnpm --dir web lint`、`pnpm --dir web format:check` 和 `pnpm --dir web build` 的结果；既有跨范围失败必须逐项与原子改动区分，不能以已知失败掩盖新增错误。
2. 每个原子的 TSX 类型使用样例：合法受控组合可编译；`Button` 无 `href`、`Link` 必有 `href`、`IconButton` 必有非空 `ariaLabel`、`Label` 必有 `controlId`、Input 必有 `onInput`、Select 必有原生 option 内容和 `onChange`、Checkbox 必有 `onChange`、Input 不能选择非 `date` 类型、Select 不能接收业务数据源等非法组合被类型拒绝。以上正负样例固定在 `mobile-ui/atoms/types.test.ts`。
3. `defineAtom` 的 defaults 合并测试：部分传入 `options` 时 render 收到完整渲染模型，未传入的字段取 `defaults` 值。原运行时 fail-fast 测试已随运行时校验一并移除，不再作为验收证据。
4. 结构测试或等价 DOM 断言：Button/IconButton 渲染 button，Link 渲染 anchor，Label 正确关联控件，Input/Checkbox 固定原生 type，Select 保留 option，invalid/loading/disabled 映射到规定的原生或 ARIA 属性。
5. 键盘和状态测试：Tab 焦点可见；Space/Enter 保持原生 Button/Checkbox 行为；disabled/loading 不触发回调；Select 和 date input 的 change/input 向上交付最新受控值；invalid 有可访问描述关联。
6. `375x812`、窄屏 `360px`、文字缩放和 reduced-motion 检查：无横向溢出，44px 控件不缩小，状态切换无布局抖动。正式接入业务组件前，还要将该检查纳入 `REGRESSION-BASELINE.md`。
7. 依赖边界检查：原子目录的 import 图只可指向 Solid、原子内部文件及已批准的 token/class helper；不得出现 `common/data`、`solid/data`、Client SDK、业务组件、页面或 Desktop 路径。

交接前在当前工作树运行的 `ops quality check`、`pnpm --dir web format:check`、typecheck、lint、build、`test:core` 和原子类型契约单测（`mobile-ui/atoms/types.test.ts`）均通过，详见 `PM-STATUS.md` 的“质量基线与阻塞项”。原子实现完成后的任何改动仍必须复跑并逐项对比该基线；这些静态结果不替代未来页面消费者的浏览器回归验收。

## 接入门槛

只有在本契约经 PM 审定、原子实现与独立验证完成、样式 inventory 冻结且 `COMPONENT-LIBRARY.md` 已用本文件 API 编写完成后，业务组件才可按独立迁移任务开始消费原子。接入顺序为原子 -> 分子（如有证据）-> 业务组件 -> 页面；不得通过一次重写 Filter 或 Shelf 来同时验证组件库与 CSS 架构。

## 修订记录

- 2026-09-06：由用户决策，以「类型即契约」取代「全环境运行时 fail-fast」。理由：单人、全 TypeScript strict 的工作流中类型防线真实存在，而运行时校验只能覆盖少数穿透通道；删除后消除 `config.ts` 的 12 个校验 helper、九原子内的校验样板（九组件由 613 行降至 425 行）与每次渲染的校验开销。Props 类型与导出面不变；新增 `mobile-ui/atoms/define.ts` 的 `defineAtom`（defaults 编译期锚定 + `Partial` 合并），`config.test.ts` 的 6 条运行时 fail-fast 测试由 `types.test.ts` 的 `@ts-expect-error` 类型负样例与 defaults 合并断言取代。明确放弃的防线见「类型即契约」节，其中 `Link` 的 `_blank`/`rel` 组合从"抛错"变为"调用方责任"。

- 2026-09-06（续）：用户裁决——`Link` 的 `target="_blank"` + `rel` 组合**接受调用方自律**（`rel: string` 无法在类型层表达 token 组合，判别 union 方案因复杂化 defaults 锚定被否决）；该项从运行时防线清单转入调用方约定。

- 2026-09-06（`PLAN-MOBILE-THEME-SETTINGS-001`）：按该计划已批准的 atom 作用域主题延伸，`defineAtom` 为九原子的原生根追加共享 `.m-atom` class，不添加 DOM wrapper，不改变 Props、defaults 或配置校验。新增由 mobile-ui 所有的 `themes.css`，仅在 `html[data-theme]` / `html[data-font]` 前缀下覆盖 `.m-atom` 的同名语义变量、字体栈与 `color-scheme`；属性缺失使用默认纸张 / 无衬线。`tokens.css` 只新增与既有系统无衬线栈一致的 `--font-body`，既有 palette 名字及根默认值不变。`atoms.css` 自己消费字体与背景变量；页面不能将共享 class 放在业务容器上，也不能覆写原子内部外观。设置页按 `tokens -> base -> themes -> atoms -> shell` 引入必要模块；其他既有页面不引入主题模块。`<html>` 属性仅为主题载体，不把 token 覆盖放到 `<html>` 本身，不改变 legacy 外观。设置存取、首绘与用户选择留在 Mobile 页面 / 逻辑层，原子不读取存储或管理设置状态。

- 2026-09-06（设置页九项决策迭代）：用户批准 Field、选项数据与值回调、Data/Client 分层、整页 PageContainer 主题及新页头/底部导航，替代上述首轮 atom 根作用域方案。Select 的正式输入改为泛型只读 `items: { value, label }[]`、一致类型的 `value` 和 `onChange(value)`、`Partial<SelectOptions>`；废止 content 原生 option 和 DOM event 回调。Select 内部以列表匹配转换 DOM 字符串，不接收领域源或读取数据；独立使用以 options.ariaLabel 或既有 id/外部 Label 命名，Field 内由 `atoms/field-context.ts` 的内部关联上下文提供 id。Field 是 molecule，不是第十个 atom；PageHeader/BottomNav 属 molecules，PageContainer 属 containers，均接收外部输入且无 Client/存储依赖。主题语义变量仅覆盖 `.m-page-container`，由内部各层继承；移除原子共享根注入和统一背景，不扩大到旧页面。defineAtom 保留 mergeProps getter 与既有 defaults 合并，render model 类型采用实际 mergeProps 返回类型，无断言或运行时配置校验。源码已按此修订；用户暂停测试，尚无新版编译或浏览器验收结论。

- 2026-09-06 (`PLAN-MOBILE-ATOM-EXPANSION-001` R1)：增加 `Tag`、`Tab`、`Chip`，并将 `Text.tone` 扩为 `accent`、`Link.variant` 扩为 `cta`。`TabGroup` 支持方向键/Home/End roving focus，`ChipGroup` 支持横向方向键循环，`StateMessage` 负责 loading/empty/error 和可选重试；三者只组合原子和稳定 DOM，不读取 Client、数据或路由。`themes.css` 将 dark/sepia/font 变量继承边界扩展到公开 `.mobile-shell`，新原子与分子样式集中在 `mobile-ui/styles/atoms.css` / `molecules.css`。ArticleRow、ShelfCard、Shelf index、公开页头/行动链接、详情返回和状态块已接入组件库；`.article-body` 仍保持独立主题边界。视觉截图与用户逐轮裁定仍是 R2-R5 的关闭条件。
