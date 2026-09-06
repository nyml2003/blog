# 文章列表契约修复交付记录

日期：2026-09-06。实现和真实后端浏览器验证完成；整体质量门禁尚有其他在途写集中的阻塞，按用户授权归档并保留限制。

## 修改与 Review

- `common/contracts/domain.ts` 与 `common/client/domain.ts` 新增 `ArticleListItem = Omit<Article, "contentHtml">`。沿用既有协议可选性：嵌入类型、发布时间和 terms 保持原有兼容规则。混合可选性属于外部响应协议边界，无新例外。
- `common/client/domain.ts` 从详情 schema 显式 omit 正文字段构造列表 schema；详情 schema 保持原样，Admin 详情仍需 htmlInspection。`parseArticleList` 返回列表项类型。
- `common/client/client.ts` 的两个列表方法使用统一的列表 schema，移除本文件内重复 schema；返回类型收窄到列表项。既有 branded ID 的断言保留在 schema 边界：正整数先由 zod 校验，不增加绕过验证的断言。
- `desktop/src/app.tsx` 仅新增类型导入并收窄 Shelf 的 items 类型；其进入任务前已有的 import 顺序、移除预览链接等修改保留。公开列表和 Admin 页通过推导适配，不访问正文，不必修改。
- `common/client/client.test.ts` 新 fixture 通过真实 JSON transport envelope 解码，覆盖非空列表而非空数组；新增断言无类型强转。正例确认 total 不由 items.length 重算；负例确认缺正文仍走 protocol error。
- 人工逐文件检查了修改处及两个列表页面消费路径：无新增隐藏副作用、异步控制流或异常吞噬。原有 Admin 页面网络失败时缺少明确 error UI 属相邻问题，此次仅修正常列表解码，不扩大 UI 范围。
- 未修改 Rust、数据库、Mobile、编辑器、依赖、lockfile、公共 wire、FACTS 或架构。未接入分页。

## 自动化证据

下列命令从项目根目录执行，环境为 `direnv exec .` 加载的项目 Nix shell。

| 命令（均加 `direnv exec .` 前缀） | 修复前 | 修复后 |
| --- | --- | --- |
| `pnpm --dir src/frontend typecheck` | 失败：`mobile-ui/atoms/define.ts:48` TS2345 | 同一错误，无本次文件错误 |
| `pnpm --dir src/frontend lint` | 通过 | 通过 |
| `pnpm --dir src/frontend format:check` | 失败：`mobile-ui/atoms/select.tsx:32` | 该文件未改；另行验证本次 5 文件通过 |
| `pnpm --dir src/frontend test:core` | 29 tests + 287 parity cases 通过 | 32 tests + 287 parity cases 通过 |
| `pnpm --dir src/frontend build` | 未跑 | 通过，191 modules |
| `pnpm --dir src/frontend exec tsx --test common/client/client.test.ts` | 加入回归后 2 失败 / 2 通过 | 4 通过 |

红灯包含 `items.0.contentHtml` 协议错误及意外正文未被列表 schema 丢弃。改动后同命令全绿。

定向格式检查：

```sh
direnv exec . pnpm --dir src/frontend exec biome format common/contracts/domain.ts common/client/domain.ts common/client/client.ts common/client/client.test.ts desktop/src/app.tsx
```

本次范围 `git diff --check` 通过。未运行全量 Rust/ops 门禁：没有修改该范围源码。

## 真实浏览器证据

复用已运行的 `ops runtime integration --product-port 8180 --data-port 8181`，进程为 Rust Product + Rust Data（test 数据语义），不是 Mock Product API。构建后的 `src/frontend/dist` 由 Product 同源托管。仅执行读请求，无浏览器 API 拦截或 mock-session，无数据库写入。

```sh
BLOG_PLAYWRIGHT_MODULE=/home/nyml/.npm/_npx/520e866687cefe78/node_modules/playwright-core/index.mjs \
BLOG_CHROMIUM_PATH=/tmp/blog-theme-browser/chromium/chrome-headless-shell \
BLOG_LIST_EVIDENCE_DIR=/tmp/blog-article-list-evidence \
direnv exec . node docs/plans/archive/PLAN-CLIENT-ARTICLE-LIST-001/BROWSER-CHECK.mjs http://127.0.0.1:8180
```

| 页面 / 场景 | 实际结果 |
| --- | --- |
| Desktop `/articles/index.html` | 9 行，total 9，标题顺序与真实响应一致 |
| UI 选择 type 2 + term 4，提交筛选 | 2 行，total 2，各项匹配两个条件 |
| Desktop `/admin/` | 12 行，含草稿及已发布，标题顺序与响应一致 |
| Desktop `/articles/detail.html?id=12` | 正文成功渲染 |
| Mobile `/m/` | 6 条推荐，wire 均含正文 |
| Mobile `/m/articles/index.html` | total 9，含推荐重复展示的 12 张卡片，数量与 BFF sections 一致 |
| Mobile `/m/articles/detail.html?id=12` | 正文成功渲染 |

Desktop viewport 1440x1000，Mobile viewport 390x844。浏览器 pageerror 为 0。公开列表、Admin 列表及 Mobile shelf 截图经人工查看，列表内容正常展示。

JSON 与 7 张完整页面截图位于 `/tmp/blog-article-list-evidence/`。临时浏览器与截图路径依赖当前机器，后续可用脚本重新生成；上述表格保留本次结果，不代表生产验收或完整 Mobile 交互回归。

## 归档说明

当前代码修复和列表真实页面证据已交付。`typecheck` 与 `format:check` 的剩余问题属于编辑器与 Mobile 其他计划写集，未被本次归档声称为已解决。
