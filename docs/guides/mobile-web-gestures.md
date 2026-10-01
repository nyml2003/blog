---
kind: guide
id: GUIDE-MOBILE-WEB-GESTURES
status: current
owner: frontend
last_reviewed: 2026-10-01
---

# 移动 Web 手感开发：行为矩阵与坑位图

来源：`apps/playground` 在 2026-09-11/12 的真机调研实证，以及当前源码和测试中的复现结果。结论先行：**mobile web 的"极致手感"有平台天花板，达到 Ionic 级需要长期行为沉淀**；本仓库优先保证架构清晰和交互可用，具体取舍以当前实现与专项任务为准。本文记录踩过的每个坑的根因与正解，避免重复交学费。

## 一、平台硬边界（接受它们，不要试图绕过）

| 边界 | 事实 | 影响 |
| --- | --- | --- |
| 系统边缘手势不可监听 | iOS/Android 的边缘返回手势在浏览器层处理，页面收不到任何事件、无进度 API、不可 preventDefault | "侧滑跟手关闭浮层"只能用页面内边缘热区近似；真·系统侧滑只能被动响应 popstate |
| popstate 时 auto VT 已启动 | Safari 手势驱动的同文档 View Transition 在 popstate 派发**之前**就已捕获 old 快照 | popstate 处理器里用 startViewTransition 抢占无效——正确做法是 CSS 定制 auto VT 的动画，而非 JS 抢占 |
| VT 独立命名层的绘制顺序跟 DOM 顺序 | `::view-transition-*` 各层的叠放按 DOM 顺序，**不遵循 z-index** | "高 z-index 页面盖住浮层"的 DOM 关系进 VT 快照后失效；覆盖型导航需临时摘掉浮层的 view-transition-name |
| 嵌套 VT 名被静默忽略 | named 元素不能是另一 named 元素的后代 | scrim 挂在 sheet（named）的 shadow 内时命名无效，浏览器不报错 |
| reduced-motion 可被 App 级误报 | 国产浏览器（夸克实测）把省电模式映射成 `prefers-reduced-motion: reduce` | 动画静默消失；逃生舱只能是用户显式操作（点按开关）覆盖，不能默认覆盖无障碍偏好 |
| 非安全上下文缺 API | `crypto.randomUUID` 仅 secure context 可用；HTTP 局域网访问时被摘除 | LAN 调试必挂；fallback 到 `crypto.getRandomValues` 手组 v4 |

## 二、API 语义：一次学清，别靠猜

### touch-action 是"许可"不是"拦截"

`pan-y` 表示"垂直 pan 允许浏览器直接处理"。放行过几个 move 之后浏览器激活原生滚动，**此后 `touchmove.preventDefault()` 无效**——你拦不住一个已经授权的东西。

推论：**"X 优先消费"若与原生手势方向冲突，唯一稳的出路是手势开始前就用 touch-action 决定归属**。实测方案：半屏浮层内滚动容器按状态切换——half 态 `touch-action: none`（垂直全归 JS，上滑升浮层不与原生滚动竞争），full 态恢复 `pan-y`（原生惯性滚动）。

手势中途从原生滚动交班给 JS 时，touchmove 可能已 `cancelable=false`——此时 `preventDefault()` 只会被忽略并打 `[Intervention]` 告警。守卫 `if (event.cancelable)` 再调；交班照常进行（列表已在边界，无链可传时本就无需拦截）。

### overscroll-behavior：contain 和 none 不一样

`contain` 只阻止滚动链（chaining），**保留容器自身的橡皮筋**（iOS）；`none` 两者都禁。浮层场景要 `none`——橡皮筋会跟你的 transform 跟手叠加（双动/"鬼畜"）。

### dvh / svh：幻影滚动的来源

`100dvh` 在地址栏可见时比视口高（动态值），容器天生超出屏幕一截——表现为页面底部一块"滚不完的空白"。**不溢出用 `100svh`**（小视口高）；浮层要盖满收起地址栏后的整屏才用 `100dvh`（fixed 定位不产生滚动，安全）。

### popover 的 top layer 与 transform 祖先

- top layer 层叠 = **入场顺序**（后 show 在上），组件零 z-index 知识——浮层叠浮层的正解；
- 但 `position: fixed` 的后裔若祖先带 `transform`（如浮层自身 translateY），fixed 改为相对该祖先定位——**遮罩元素不能放进可 transform 浮层的 shadow 里**，挂到静止祖先（body）；
- shadow 内部元素的 popover 在部分引擎上不稳定（实测 scrim 静默不显示），body 挂载版全绿；
- popover UA 样式自带 `border`、`background: canvas`、`height: fit-content`——不显式清除会出"黑框"、透明背景、高度塌陷三种怪相。

### AbortSignal / 权限类 API 的 secure context 静默缺失

见硬边界表。同类：Notification、getUserMedia。LAN HTTP 调试时先想这个。

## 三、View Transitions：能力与陷阱

| 事实 | 对策 |
| --- | --- |
| 同文档 auto VT 在 Chrome 126+/Safari 18.2+ 默认开启，零代码获得页面滑动转场 | 不自建动画引擎（Ionic 教训），转场全骑 VT |
| 活跃的手动过渡使 auto 跳过；但手势驱动的 auto 在 popstate 前已启动，抢不过 | 与浏览器 VT 竞争时**用 CSS 定制 auto 的动画**（场景类 + `::view-transition-old/new` 规则），别用 JS 抢占 |
| VT 名是全局命名空间，重名静默错乱（浏览器不报错） | 集中注册制：元素首次需要时领唯一名、终身持有（old/new 快照靠同名配对，**不能**每次转场换名）；手写固定名全部废除 |
| 独立命名层让该元素从 root 快照中分离 | 需要"被盖住"参与整页转场时，临时摘名（inline `view-transition-name: none`），转场结束恢复 |
| 转场规则与 keyframes 可以完全运行时生成 | 参数化模板（slide(axis, from, to) / fade）+ adoptedStyleSheet 幂等注入——Ionic/Flutter 式命令式转场在 VT 上的正确形态；`CSSStyleSheet` 需惰性创建（node 测试环境导入兼容） |
| 无 VT 的引擎（夸克/Via 等 Chromium 老分叉） | 手写 transform 滑动兜底或直接切换；可用启动探针（空过渡 + 查伪元素 computedStyle）实测降级 |

## 四、历史栈与浮层语义（实测定的规矩）

- **浮层是页面内 UI，不是导航**：开合不动历史；系统侧滑在浮层开着时无事可退（历史顶就是当前页）；
- page push 前把**完整视图栈快照**（serialize 数组）写进当前历史条目（即未来落点）——back 时按快照**重建**栈（不是弹栈）。布尔标记（"有 sheet"）或单点标记（"恢复到 list"）都会在两层以上浮层栈时塌方，粒度必须是完整快照；
- 防重入条件比较**内容身份**（id/form），不是视图种类——"栈顶已是 detail 就拒绝"会阻断阅读流（详情→推荐→下一篇）；
- 状态机方法在稳态下的重入必须零副作用：对已 closed 的浮层重复 close() 会重挂场景类、污染不相关的 VT。

## 五、布局与组件

- h()（hyperscript）构建视图时，**包装根节点会夹断 flex 布局链**（`flex: 1; min-height: 0` 传不进去，滚动容器拿到自由高度失效，"列表和浮层一起滚"）——包装层用 `display: contents` 穿透；
- `hidden` 属性会被类样式里的 `display: flex` 覆盖（UA 的 `[hidden] { display: none }` 特异性更低）——`[hidden]` 显式规则不可省；未被隐藏的 fixed/transform 移出元素在移动引擎上仍扩大可滚区域（幻影空白）；
- 视图 DOM 保活（display 切换）= 0 渲染返回原位（滚动/浏览位置不变），保活池理念的微缩版。

## 六、工具链：成本的大头

真机调试回路是"改→刷新→人工描述→再改"，交互 bug 定位成本平方级放大。**在打磨任何手势之前先立回路**：vConsole/eruda 注入（dev only）、桌面 DevTools 触摸模拟先过一遍逻辑、关键手势路径加 debug 日志开关。没有回路的手感打磨不要开始。

## 七、止损判据

- 目标是"验证架构"（本仓库现状）：做到可用且不廉价即停，本文档即是天花板实证；
- 目标是"产品级手感"：评估 Ionic/vaul 等已沉淀库，或原生壳（Capacitor——系统手势、转场、生命周期立刻全部原生级，web 代码不重写）；kernel/ports 架构（`@fluvient-loom`）天生多宿主，原生只是下一个适配器，不是推翻。
