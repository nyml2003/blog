# PM 实施审查记录

## 2026-09-06 主题阶段预检

- 浏览器工具已就绪：Playwright 模块 `/home/nyml/.npm/_npx/520e866687cefe78/node_modules/playwright-core/index.mjs`，Chromium 可执行文件 `/tmp/blog-theme-browser/chromium/chrome-headless-shell`。版本 151.0.7922.34，启动并访问本地 dev 已成功。仅修补临时目录的浏览器副本及测试库，未改全局环境、浏览器缓存或项目依赖。
- 对比度预检：paper 的既有 `--muted: #68717d` 对 `--paper: #f4f1ea` 约 4.38:1，低于本计划 4.5:1。因此设置页不得把该组合误记为通过；默认值冻结，需明确区分页面实际用到的文字与所有原子状态的覆盖。
- dark 的 `--blue: #9eb7ff` 若继续以外偏移 outline 绘制在 legacy 纸色背景上，对比度约 1.74:1。验收必须查看实际焦点与外侧背景，而不能仅计算其对 dark 原子内部背景的对比度。需要在既有主题作用域内处理可见焦点，不扩展 Props。
- 现有 `test:core` 是显式测试清单，不自动发现 Mobile 新测试；设置存取测试必须用显式命令执行并记录。是否纳入长期测试入口应另行记录写集协调，不能将 `test:core` 绿灯说成已执行设置存取测试。

本文件是执行期审查记录，不是新的产品决策或验收结论。

## 浏览器失败 1：刷新后 Select 显示与已应用值不一致

`BROWSER-CHECK.mjs` 在第 2 个组合失败：选择 serif 后 html 属性、localStorage、select.value 均为 serif；刷新后 html 与存储仍为 serif，但 Select 显示 sans。独立 Playwright 复现相同结果。这是现有 Select 的受控显示实现问题，不能以设置已持久化判为成功。

待 frontend-mobile 定位并提交最小修复建议；不得在页面通过 selected 属性、DOM 回写或新增 Props 绕过控件契约。当前浏览器矩阵尚未通过。

## 用户调整后续处理

用户要求暂停测试、优先实现。后续仅按源码修复已有 Select 受控契约；PM 已将 `select.tsx` 的最小实现修复加入写集。不得新增 Props 或由页面手动操纵 Select DOM，不扩大到无关原子整改。修复后不再运行测试或浏览器，不把修复状态等同验收通过。
