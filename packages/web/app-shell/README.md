# @fluvient-loom/app-shell

宿主无关的 App Shell 描述与 HTML/CSS 生成器。

第一阶段只提供确定性的 shell 结构和骨架几何约束。包不访问浏览器全局，不依赖 Solid、Vite、路由或业务 API，也不负责挂载、删壳、请求数据和页面主题。应用在接入阶段负责提供页面内容、主题变量和生命周期。

```ts
import { renderAppShell } from "@fluvient-loom/app-shell";

const rendered = renderAppShell({
  id: "mobile-home-shell",
  platform: "mobile",
  loadingLabel: "正在加载首页",
  regions: [
    {
      id: "header",
      role: "banner",
      blockSize: "68px",
      placeholders: [],
    },
    {
      id: "content",
      role: "main",
      blockSize: "480px",
      placeholders: [
        { kind: "media", blockSize: "180px", aspectRatio: 16 / 9 },
        { kind: "line", blockSize: "22px", inlineSize: "86%" },
      ],
    },
  ],
});
```

`rendered.html` 可以注入静态页面模板，`rendered.criticalCss` 可以随模板内联。第二阶段接入博客时，应用仍拥有页面级 shell 模板和删壳时机；本包不保存页面内容。

静态基础样式通过 `@fluvient-loom/app-shell/styles.css` 导入。消费者应提供 `--loom-shell-skeleton`、`--loom-shell-surface` 和 `--loom-shell-radius` 等主题变量，并在 `prefers-reduced-motion: reduce` 时关闭流光动画。

当前包只作为 workspace 包维护，未发布到公共 npm registry。
