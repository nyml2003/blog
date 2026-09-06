---
kind: acceptance
id: ACCEPTANCE-MOBILE-DENSITY-002
plan_id: PLAN-MOBILE-DENSITY-002
status: completed
owner: quality
last_reviewed: 2026-09-05
---

# C Mobile 详情页验收记录

## 自动化门禁

| 检查 | 结果 |
| --- | --- |
| `go test ./...` | passed |
| `pnpm --dir web test:core` | passed, 7 tests |
| `pnpm --dir web typecheck` | passed |
| `pnpm --dir web lint` | passed |
| `pnpm --dir web format:check` | passed |
| `pnpm --dir web build` | passed |
| `ops quality check` | passed |

## 运行态证据

- 正式运行态 `127.0.0.1:8091` 的 `public.mobile_article_shelf` 在 `type_id=1` 下仍只返回类型 section，不返回推荐 section。
- 临时数据库副本运行态 `127.0.0.1:8092` 的文章 `id=101` 返回长标题、空摘要、标题/段落/列表/代码/引用/表格/图片/链接 HTML；文章详情响应为 `200`。
- 临时运行态的不存在文章返回 `404/ARTICLE_NOT_FOUND`，详情 HTML 入口返回 `200`，并引用新生成的 Mobile 详情脚本和 CSS。
- 临时数据库位于 `/tmp`，未修改正式 `blog.db`。

## 人工视口门禁

以下项目需要在带浏览器的设备模拟环境中完成并补充截图/测量值：

- `375x812` 竖屏和 `812x375` 横屏的前后对比；
- canonical 短文章正文入口不超过 `300px`，相对旧版本减少至少 `20%`；
- 长标题、无摘要和复杂 HTML 无覆盖、无页面横向滚动；
- 代码块/宽表格仅自身横向滚动，图片不超出正文容器；
- 顶部返回、系统返回、新标签打开和错误重试路径；
- reduced-motion、键盘焦点和 `44x44px` 触控盒检查。

当前容器没有 Chromium、Firefox、Playwright 或 Puppeteer，无法生成真实视口截图。产品负责人已于 2026-09-05 确认当前实现完成并授权关闭计划；该截图缺口保留为后续浏览器测试基础设施工作的证据限制，不阻塞本轮归档。
