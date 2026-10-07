# @fluvient-loom/page-kit

页面接入框架的运行时装配半边。页面登记与路由契约位于
`@fluvient-loom/page-contract`，本包只提供浏览器宿主适配器。

## 接入一个新页面（接口而非模板）

```
1. 建包：packages/app/pages/<name>/{package.json, src/definition.ts, src/page.tsx}
2. 实现接口（全程类型导引、编译期执法）：
   definition.ts → definePage({ id, platform, outputPath, title, aliases,
                                description?, bootstrap?, shell?, params?, load })
   page.tsx      → (input: 本页声明的窄切面) => Component
   load 是懒装载（只允许 import() 表达式）：id → 装载映射由注册表派生，
   bootstrap entry 不枚举页面。
   params 是本页的 URL 参数 schema（Standard Schema，必须同步）：登记产出
   parseParams(search)，惰性解析并返回 Result，页面按需消费；省略 = 本页不读
   URL 参数，parseParams 恒返回 ok({})。schema 库由页面包自选（当前用 zod）。
   双出口："." 纯数据（node 安全，注册表构建期 import 用）；
          "./page" 组件工厂（可含样式副作用，只在 load 里被拉进浏览器图）
3. 宿主注册表加两行（人写的代码，工具永不代改）：
   import { xxxPage } from "@blog/page-<name>";
   pageRegistry 数组加一项 xxxPage
```

参考实现即活文档：`packages/app/pages/desktop-detail`（最简）、`desktop-home`、`desktop-articles`。

## 契约与运行时导出

- `.`（shared，纯）：re-export `@fluvient-loom/page-contract` 的页面登记、路由和参数解析契约；
- `./mobile`：Mobile 浏览器端口装配（`createWebMobilePorts`）、`mountMobileApplication`、
  app shell 移除；
- `./desktop`：Desktop 浏览器端口装配与挂载。

设计约束（SPEC-ARCH-BOUNDARY-001）：

- 本包是宿主适配器的唯一装配点；宿主 bootstrap 是唯一调用点，只组合应用声明；
- root 导出只含契约 re-export；挂载点解析和浏览器端口只在两端子路径装配；
- 页面的抽象单位是接口：没有模板、没有生成器、没有工具改人的源文件。

构建链半边（校验/生成/vite 插件）见 `@fluvient-loom/page-build-kit`。
