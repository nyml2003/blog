# Frontend 交付记录

2026-09-06，owner：frontend-mobile。源码已交付。用户已要求暂停测试、优先完成代码；最新 Select 修复尚未验证，本文不推进计划或 Spec 的接受状态。

## 最新代码修复（未验证）

PM 浏览器先前发现：持久化 serif 后刷新，HTML 属性和 localStorage 均为 serif，Select 却显示 sans。只读检查修复前的既有构建产物确认 Select 生成代码按 `select.value = value -> 插入 option` 执行；工厂的对象 spread 提前求值页面 getter，Select render 又把 value 解构为局部常量，导致初始赋值早于选项插入并丢失受控响应性。

经 PM 扩写集授权，仅修改 `define.ts` 与 `select.tsx`：

- 工厂使用 Solid `mergeProps` 保留传入 Props getter；options getter 仍按原顺序合并 defaults 和输入，不增加配置校验或 Props。
- Select 通过 `props.value` 与 `props.content` 等属性访问保持 Solid 动态表达式，让编译器将受控 value 交给响应更新路径；未使用页面 DOM 回写、`selected` 属性或 onMount 补丁。
- Select 的动态 class 同时保留 `.m-atom`，避免 validation 变更时整段 class 更新覆盖工厂附加的主题作用域。

以上是源码修复及原因分析，未声称通过验证。按用户最新要求，修复后没有运行 typecheck、lint、format、build、测试或浏览器，也没有重启或停止 5173 / 9090 服务。frontend-mobile 当前没有运行中的命令、测试或浏览器进程。

## 实现范围

- 主题机制：新增 `mobile-ui/styles/themes.css`，仅在共享 `.m-atom` 根上覆盖主题 / 字体变量与 `color-scheme`；`defineAtom` 给原生根追加 class，不包装节点，不改变 Props 或 defaults。`atoms.css` 消费作用域背景与 `--font-body`；`tokens.css` 只新增原无衬线系统栈的字体 token。
- 设置逻辑：`mobile/src/logic/settings.ts` 固定 theme / font 枚举和两个存储键，分别捕获存储 getter、读、写失败。应用 DOM 属性与持久化分离，写失败仍保持当前页面选择；非法存储不回写。
- 设置页：同步 head 脚本先读取合法枚举；TSX 初值从已应用的 HTML 属性恢复，若 head 被阻止则保持默认，不在挂载时迟补暗色而产生闪变。使用既有 Heading / Label / Select；只用既有 shell 容器和原生 section / p 布局，无页面 CSS、任意 atom Props、内联样式或业务祖先覆写。
- 入口：Vite alias 和 build input 注册 `/m/settings/index.html`；BottomNav 增加第三项与 `settings` active 值；经 PM 扩写集确认，`shell.css` 只将原两列改为三列。
- 原子契约修订已追加。未改 Desktop、数据 SDK、原子 Props、既有三 Mobile 页面、package manifest、lockfile 或 Ops。

## 精确验证

以下为最新 Select 修复之前的历史执行记录，不能代表当前源码已经通过验证。命令均在项目根执行，带 `direnv exec /home/nyml/projects/blog` 前缀。

| 命令 | 修复前结果 |
| --- | --- |
| `pnpm --dir src/frontend typecheck` | 退出 0，包含九原子负样例类型检查 |
| `pnpm --dir src/frontend lint` | 退出 0 |
| `pnpm --dir src/frontend format:check` | 退出 0，79 文件 |
| `pnpm --dir src/frontend build` | 退出 0，173 模块，包含 `dist/mobile/pages/settings/index.html` |
| `pnpm --dir src/frontend test:core` | 退出 0，28 测试、287 组 native/WASM 一致性案例 |
| `pnpm --dir src/frontend exec tsx --test mobile/src/logic/settings.test.ts mobile-ui/atoms/types.test.ts` | 退出 0，9 测试（7 settings + 2 atom），其中 head 脚本校验 49 组合法 / 非法组合 |

新增测试显式覆盖九种合法组合、缺省 / 非法值不回写、独立字段回落、存储 getter / read / write 失败、HTML 属性应用、head 脚本容错与模块枚举一致性。`test:core` 的既有显式列表不包含新测试，因此以上单独命令不可省略。

实施过程中先增加的 head 测试因 HTML 尚未落盘出现一次 ENOENT；入口实现后通过。首次 typecheck 报测试 fixture 数组推断出 `undefined` 值不符合 `Record<string, string>`；显式声明 fixture 数组类型后通过。没有环境依赖或锁文件变更。

## 人工 Review

- 错误边界：每个存储字段独立 try/catch，DOM 更新不依赖写入成功；getter 访问本身被纳入异常边界。页面事件对 DOM 字符串做枚举 guard，没有断言或隐式副作用。
- 认知与类型：settings 对象字段全部必填；存储及 DOM 适配只需要各自最小方法集合；无异步流程、未处理 Promise、嵌套三元或新可选性例外。测试中的 `as const` 只收窄已声明字面量列表。
- CSS 所有权：主题变量只写原子根；共享 class 不挂载到 main / section，legacy header 和 nav 不消费新字体 token。组件仍持有自身背景和 focus；不会把暗色文本绘制在透明的 legacy 纸色背景上。
- 可访问性：Label 的 `for` 与 Select id 一一对应；原生 Select 保留键盘语义、44px 最小高度和稳定 outline；第三导航项继承现有 48px 触控盒及 aria-current。最终浏览器几何与外观由 PM 独立核验。
- skill：已读 ui-ux-pro-max，执行 design-system 与 ux 查询；其营销式版面、网络字体建议与项目约束不符，保留既有设计，仅用其可访问性、触控、对比度和布局检查项审查。

## 对比度与未决证据

- dark `--ink` 对 `--paper` 为 14.46:1，sepia 为 10.93:1；dark `--blue: #7185d5` 对暗色原子背景为 4.61:1、对外侧 legacy 纸色为 3.09:1，因此外偏移焦点仍可辨。数值为 sRGB 公式计算，浏览器实际状态待 PM 核验。
- paper 既有 `--muted` 对纸色只有 4.38:1，本实现未改变冻结默认值。设置页没有 muted 文本；不能将该页面实际文字通过写成所有纸张原子状态均满足 4.5:1。
- 浏览器 375x812 / 360px、刷新与重新进入首绘、legacy 对比、各原子 fixture、控件状态和原生 select 外观由 PM 验收，本文不以单测替代视觉证据。
- Product 静态白名单尚未包含设置路径，由 PM 处理范围确认；Vite 页面成功与生产入口成功是不同证据。
