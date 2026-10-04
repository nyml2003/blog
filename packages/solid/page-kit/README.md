# @fluvient-loom/page-kit

页面接入框架的运行时半边 + **页面契约模块**（页面包的唯一依赖点）。

## 接入一个新页面（接口而非模板）

```
1. 建包：packages/app/pages/<name>/{package.json, src/definition.ts, src/page.tsx}
2. 实现接口（全程类型导引、编译期执法）：
   definition.ts → definePage({ id, platform, outputPath, entry, title, aliases,
                                description?, bootstrap?, shell? })
   page.tsx      → (input: 本页声明的窄切面) => Component
   双出口："." 纯数据（node 安全，注册表构建期 import 用）；
          "./page" 组件工厂（入口与构建用，可含样式副作用）
3. 宿主注册表加两行（人写的代码，工具永不代改）：
   import { xxxPage } from "@blog/page-<name>";
   pageRegistry 数组加一项 xxxPage
```

参考实现即活文档：`packages/app/pages/desktop-detail`（最简）、`desktop-home`、`desktop-articles`。

## 契约与运行时导出

- `.`（shared，纯）：`PageRegistration`/`PagePlatform`/`PageRoute`/`pageRoutes()` 契约，
  `definePage()` 作者入口，`siteRoute()`/`siteRouteWithQuery()` 语义路由，挂载点解析；
- `./mobile`：Mobile 浏览器端口装配（`createWebMobilePorts`）、`mountMobileApplication`、
  app shell 移除；
- `./desktop`：Desktop 浏览器端口装配与挂载。

设计约束（SPEC-ARCH-BOUNDARY-001）：

- 本包是宿主适配器的唯一装配点；宿主 bootstrap 是唯一调用点，只组合应用声明；
- root 导出只含纯逻辑；两端组件各留各的子路径，Desktop/Mobile UI 隔离在包内成立；
- 页面的抽象单位是接口：没有模板、没有生成器、没有工具改人的源文件。

构建链半边（校验/生成/vite 插件）见 `@fluvient-loom/page-build-kit`。
