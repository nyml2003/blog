---
kind: plan-result
id: RESULT-MOBILE-DENSITY-001
plan_id: PLAN-MOBILE-DENSITY-001
status: completed
completed: 2026-09-05
owner: project-manager
---

# C Mobile 信息密度优化结果

## 结果

已完成 C Mobile 文章库的页面级 F 型 Shelf。Mobile 端从后端 Shelf BFF 直接读取稳定的分区数据，左侧 sticky 分区 Tab 与右侧连续文章 section 保持同步；点击 Tab 平滑定位到目标 section，不产生 URL 或浏览历史变化。

## 已验证内容

| 验收项 | 证据 | 结果 |
| --- | --- | --- |
| Mobile Shelf BFF | `GET /api/public/mobile/article-shelf?sceneCode=public.mobile_article_shelf`；运行态返回 100 篇、3 条推荐和 6 个类型分区 | 通过 |
| 后端归一化和字段裁剪 | `internal/httpapi/router.go`、`internal/httpapi/router_test.go`；推荐最多 3 条、筛选时隐藏推荐、非空类型分区和无 `contentHtml` 卡片 DTO | 通过 |
| F-Shelf 页面级结构 | `web/mobile/src/pages/articles.tsx`、`web/mobile/src/components/ui.tsx`、`web/mobile/styles.css` | 通过 |
| Tab 滚动同步 | IntersectionObserver scrollspy；点击期间目标锁定，滚动静止后交还 observer | 用户确认通过 |
| 动效和触控 | 非几何 active 指示条、`transform`/`opacity` 过渡、reduced-motion 支持、44px Tab 触控高度 | 用户确认通过 |
| 筛选契约 | BFF 使用 `term_ids`、`type_id`、日期 snake_case；共享请求层同步修正并增加精确路径测试 | 通过 |
| 后端测试 | `go test ./...` | 通过 |
| 前端核心测试、类型检查与 lint | `pnpm --dir web test:core`、`pnpm --dir web typecheck`、`pnpm --dir web lint` | 通过 |
| 生产构建 | `ops delivery build`、`pnpm --dir web build` | 通过 |

## 生效变化

- API：新增 Mobile Shelf BFF，不改变现有公共或管理端接口；
- Mobile：文章库不再在客户端合并推荐、类型和文章列表；
- UI：用页面级左索引和右内容轨道替代逐行类型锚点；
- 数据访问：统一公共和管理列表筛选参数为后端解析的 snake_case；
- 文档：补充 Shelf BFF 契约、Mobile 视觉契约和验收场景。

## 未决项与后续计划

- 无本计划范围内未决项；
- 浏览器自动化截图仍未引入，未来需要时应作为独立测试基础设施计划处理。
