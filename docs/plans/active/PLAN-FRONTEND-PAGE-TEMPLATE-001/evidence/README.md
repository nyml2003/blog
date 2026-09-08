# 页面与货架浏览器证据

## 复核入口

`browser-audit.mjs` 使用 Chromium DevTools Protocol，连接 `http://127.0.0.1:9229` 的
Chromium 和 `http://127.0.0.1:18084` 的 integration 服务。本次以显式 fixture 内容源和
独立端口启动最终构建：

```sh
nix develop ./nix -c ops runtime integration \
  --content-source fixture --product-port 18084 --data-port 18085 --json

BLOG_AUDIT_ORIGIN=http://127.0.0.1:18084 \
BLOG_AUDIT_CDP=http://127.0.0.1:9229 \
BLOG_AUDIT_EVIDENCE_DIR=/tmp/blog-page-template-audit \
node docs/plans/active/PLAN-FRONTEND-PAGE-TEMPLATE-001/evidence/browser-audit.mjs
```

可通过 `BLOG_AUDIT_ORIGIN`、`BLOG_AUDIT_CDP`、`BLOG_AUDIT_EVIDENCE_DIR` 覆盖地址和输出目录。脚本会验证 52 条断言，并捕获页面运行时错误。

## 本次结果

- `browser-report.json`：2026-09-08 06:56（Asia/Shanghai），基于当前源码重新构建
  integration 后 52/52 通过，页面运行时错误 0；这是最终修复后连续第二次完整通过，
  并明确替换此前所有 28 项旧报告；
- `desktop-t-shelf-filter-switch.png`：Desktop 文章页 T 型筛选切换；
- `mobile-t-shelf-filter-switch.png`：Mobile 首页 T 型筛选切换；
- `mobile-f-category-shelf-index.png`：index 入口一级/二级分类与文章卡片；
- `mobile-f-category-shelf-list.png`：list 入口同构分类货架；
- `mobile-f-category-shelf-history-restored.png`：分类 Back 与详情返回后的选择和滚动恢复。

`mobile-f-shelf-section-focus.png`、`mobile-f-shelf-history-restored.png` 与
`mobile-f-browse-three-level-and-load-more.png` 属于分类树改造前的旧 F 型实现，仅保留
为历史文件，不是当前验收证据；现行行为由上列三张 `mobile-f-category-*` 截图和
52 项报告证明。

增强审计先捕获分类切换把新 category 与旧 scroll 写入同一 entry、旧模型提前消费
pending restore、以及 loading 时卸载 tabs 的缺口。最终实现先持久化旧 entry，等待
requested category 与最终响应一致并渲染后恢复滚动，同时在 loading 期间保留 rails。
最终两轮均为 52/52：两个入口的分类 Back 都是 `480 -> 480`；index 详情返回是
`640 -> 640`；两处 loading 快照均为 `aria-busy=true`、一级 tabs 2 个、二级 tabs
3 个、焦点保持 `tab-2`。

本证据只证明自动化交互和运行时状态，不替代用户对视觉、文案与产品范围的最终验收。
