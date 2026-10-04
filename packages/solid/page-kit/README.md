# @fluvient-loom/page-kit

页面接入框架的运行时半边：给"写页面的人/宿主 bootstrap"用的浏览器装配与挂载。

- `.`（shared，纯）：挂载点解析等无平台逻辑；
- `./mobile`：Mobile 浏览器端口装配（`createWebMobilePorts`）、挂载（`mountMobileApplication`）、app shell 移除；
- `./desktop`：Desktop 浏览器端口装配与挂载。

设计约束（SPEC-ARCH-BOUNDARY-001）：

- **本包是宿主适配器的唯一装配点**——`@fluvient-loom/web`/`net` 等适配器只允许在本包内装配；宿主 bootstrap 是唯一调用点，只组合应用声明（api 工厂、内嵌路由清单、页面工厂）；
- root 导出只含纯逻辑；两端组件（StartupError 等）各留各的子路径，Desktop/Mobile UI 隔离边界在包内同样成立；
- 应用语义（api 客户端、site-routes 清单、预取策略）不属于本包，由宿主注入。

构建链半边（校验/生成/vite 插件/脚手架）见 `@fluvient-loom/page-build-kit`。
