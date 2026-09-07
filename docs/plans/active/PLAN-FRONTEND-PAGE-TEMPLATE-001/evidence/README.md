# 页面与货架浏览器证据

## 复核入口

`browser-audit.mjs` 使用 Chromium DevTools Protocol，默认连接 `http://127.0.0.1:9229` 的 Chromium 和用户验收服务 `http://127.0.0.1:18084`。运行前启动 integration 服务与 headless Chromium，然后执行：

```sh
node docs/plans/active/PLAN-FRONTEND-PAGE-TEMPLATE-001/evidence/browser-audit.mjs
```

可通过 `BLOG_AUDIT_ORIGIN`、`BLOG_AUDIT_CDP`、`BLOG_AUDIT_EVIDENCE_DIR` 覆盖地址和输出目录。脚本会验证 28 条断言，并捕获页面运行时错误。

## 本次结果

- `browser-report.json`：2026-09-07，28/28 通过，页面运行时错误 0；
- `desktop-t-shelf-filter-switch.png`：Desktop 文章页 T 型筛选切换；
- `mobile-t-shelf-filter-switch.png`：Mobile 首页 T 型筛选切换；
- `mobile-f-shelf-section-focus.png`：Mobile F 型货架分区定位；
- `mobile-f-shelf-history-restored.png`：从详情返回后分区与滚动位置恢复；
- `mobile-f-browse-three-level-and-load-more.png`：F 型二级页加载更多、三级筛选与空态。

本证据只证明自动化交互和运行时状态，不替代用户对视觉、文案与产品范围的最终验收。
