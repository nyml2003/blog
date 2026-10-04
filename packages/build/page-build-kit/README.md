# @fluvient-loom/page-build-kit

页面接入框架的构建链半边：给"接页面的人/宿主构建链"用的校验、生成、Vite 插件与脚手架核心。

- `types`：`PageRegistration` 页面登记契约（id/platform/outputPath/entry/title/description/aliases/bootstrap/shell）与 `pageRoutes()` 投影；
- `validate`：14 条语义规则（唯一性、alias×outputPath 交叉冲突、平台世界一致性等），fs 依赖全部注入，宿主提供真实实现；
- `generate`：site-routes 清单生成（canonical = `aliases[0]`），纯函数；
- `scaffold`：新页面脚手架（计划 → 校验先行 → 文本插入 → 经注入 IO 写入）；
- `plugins`：page-template（HTML 生成/搬运）、page-bootstrap（内联引导注入，入口显式参数）、page-routes（dev alias 重写）。

设计约束：包 src 保持纯函数（真实 fs/进程访问由宿主 glue 提供）；本包按设计运行在 Node/Vite 构建环境（package-guard 的构建期包类别）。

运行时半边（装配/mount/definePage）见 `@fluvient-loom/page-kit`（规划中）。
