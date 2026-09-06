# Frontend 交付记录

2026-09-06，owner：frontend-mobile。九项新决策对应源码已交付，测试仍按用户要求暂停。本文不推进计划或 Spec 的接受状态；下方首轮修复与测试记录仅保留历史。

## 九项决策实施交付（未验证）

- `common/data/storage.ts` 提供可注入同步存储适配；getter、read、write 的异常转换为 `Result`，null 在边界归一化；不包含主题业务。
- `common/client/mobile-settings.ts` 独占值域、默认、选项、存储键和默认回落语义；独立 `mobile-settings-browser.ts` 注入浏览器 localStorage。未改文章 client.ts、domain.ts 或公共文章契约。
- Mobile adapter 从首绘已应用属性建立 signal，选择命令先更新状态和主题再调用 Client 保存，保存结果单独保留；持久化失败不撤销本页选择。页面不读取存储、不定义选项、不操作 DOM change 事件。
- `define.ts` 的 render model 使用 Solid `mergeProps` 实际返回类型，取代无法证明等价的 Omit 交叉类型，针对外部报告的 TS2345 修订类型定义；没有不安全断言。工厂继续保留 getter，并移除首轮 `.m-atom` 根注入。
- Select 改为泛型 `items: readonly { value, label }[]`、`value`、`onChange(value)`；内部匹配列表再回调，未断言 DOM 字符串为领域枚举。保留 state、validation、describedById、id、name；独立使用新增 ariaLabel，Field 内由底层 context 获得唯一 control id。
- Field 使用 createUniqueId + 原子层内部关联 context，自动关联 Label 与 Select；页面不重复写 id。PageHeader / BottomNav 接收外部内容与导航数据并组合既有原子；PageContainer 提供唯一 main、跳转入口、整页背景、间距、视口高度、安全区和底栏避让。
- `themes.css` 将语义变量覆盖移至 `.m-page-container`；正文、页头和底部导航一起继承主题；atoms 取消首轮统一背景块，保留 Select / Button 等语义表面。新 molecules / containers 样式只拥有自己边界，不覆写 atom 内部。
- dark `--blue` 恢复为 `#9eb7ff`：焦点外侧现为同一暗色容器，首轮兼顾 legacy 纸面外侧的折中已不适用。paper 根 palette 仍保持原值。
- `settings-bootstrap.ts` 通过同一 Client 和 Data 源码读取并应用主题；HTML 手写脚本已移除。Vite 插件使用现有 Vite API 将纯 TS 首绘入口打为 IIFE 并以内联同步 script 放入 head；dev 与正式构建走同一函数，不新增依赖或单独存储规则。插件设置 `configFile: false` 避免递归加载主配置，`write: false` 不创建中间构建产物。
- 设置页改为 PageContainer + PageHeader + Field/Select + BottomNav，不再导入 legacy ui.tsx/shell.css。本轮保留旧页面既有入口改动。

## 本轮执行与协调

本轮仅进行了文件读取、源码搜索、Git diff 阅读和 apply_patch 编辑。没有运行 typecheck、lint、format、build、测试或浏览器；没有启动、停止或手动重启服务。修改 Vite 配置可能被用户现有 dev watcher 自动检测，未主动控制该进程。

Vite 只新增 bootstrap import 和 plugin 调用；编辑前复读配置，保留 Desktop 删除 preview 入口与并行新增 editor-guide 的内容。其他计划新增目录和 Ops 改动未回退。

现有 `types.test.ts` 只将 Select 合法 / 非法样例的 content 机械替换为 items；原 settings.test.ts 重接被迁移的导入和本地适配 helper，并将同一条 head 测试机械切换到 Vite 插件返回的同步脚本；默认值属性断言随新版统一归一化调整。没有新增测试、执行插件构建或运行测试，不能宣称当前测试通过。

PM 最后一轮只读审查已落实：Link 保留 Props 属性访问以同步 aria-current；dark blue 使用 `#9eb7ff`；PageContainer 采用视口内 `auto / minmax(0, 1fr) / auto` 三行网格、main 独立滚动，底栏按内容自然占高，不依赖固定 80px 预留；bootstrap 插入 head 末尾，charset 保留原 HTML 前部且脚本仍在 body 前同步执行。

## 本轮未决

- 所有新版实现尚未经过编译、静态工具或浏览器验证；TS2345 仅完成针对性源码修订，未确认编译器结果。
- 同步 IIFE 构建、首绘、Select 泛型推断与受控更新、Field 关联、全页布局和三主题均待后续验证。
- 既有 paper muted 对比度不足记录仍成立；本页不消费 muted 文本，但不能推广为所有默认组件文字均符合对比度要求。
- Product 精确静态路由确认未完成，Rust 未改；不得声明 integration 设置入口已可用。

## 首轮代码修复（历史，未验证）

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
