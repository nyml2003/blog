# PLAN-MOBILE-WEAPP-001 结果

状态：`partial`

## 已交付

- P0.1-P0.7：协议包、纯逻辑包、页面契约与 Web 装配拆分；HTTP 内核归类；依赖精准门禁；H5 质量与 E2E 回归。
- P1.1-P1.3：原生小程序工程、`wx.request` 宿主适配、四个公开页面、独立构建与 `ops weapp check|build`。
- 小程序详情页将 `article-html/v1` 白名单内容转换为 `rich-text` 节点，拒绝非法标签/属性/嵌套，保留 HTTPS 链接并提供点击处理。
- 首页使用 `tShelfFromPageModule` 协议解析；首页、文章列表、详情页区分 loading/error/empty/ready 状态；设置页沿用 H5 的 `blog.mobile.settings.v1` 值域。
- 文章页使用 `categoryShelf` 协议进行分类浏览，搜索使用 `articleSearch` 协议并生成原生高亮片段；相关逻辑和非法输入测试已固化到小程序测试套件。

## 证据

- `ops quality check`：通过 cargo、全仓 TypeScript、lint、format、测试、前端生产构建和架构边界。
- `ops weapp check`、`pnpm --filter @blog/weapp test`：通过，4/4；共享 `@blog/mobile-api` 经 `wx.request` smoke，主 bundle 约 773 KiB，低于 2 MiB 检查阈值。
- `BLOG_WEAPP_API_ORIGIN=https://product.example.invalid pnpm --filter @blog/weapp build`：通过，产物 `app.js` 和 `README.txt` 均写入指定 origin；未连接该示例地址。
- `pnpm exec tsc --noEmit -p packages/solid/page-contract/tsconfig.json`：通过；配置仅含 `ES2022`，契约无 DOM/Solid 依赖。
- rich-text 转换 smoke：通过代表性正文、实体、HTTPS 链接和非法 HTML 拒绝用例。
- 机器检查未发现微信开发者工具或 CLI。

## 未交付

- P1.4 的微信开发者工具真实打开、Mock/Product 域名代理和四页交互证据。
- 真机、正式 AppID、备案域名、发布上传链和主包分包优化属于计划非目标。

## 恢复条件

在具备微信开发者工具或等价可执行小程序宿主后，打开 `target/weapp`，分别用 Mock/Product 验证首页模块缺失、网络错误/超时、文章正文链接、收藏持久化、主题/字体刷新保持，再将 P1.4 与本结果状态更新为 `completed`。
