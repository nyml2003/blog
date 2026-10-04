# PLAN-PAGE-PACKAGING-001 · P3c 交付记录：试点页面包与 registry 聚合

2026-10-04 执行。P3c 完成（P3d 批量迁移未开始）。

## 交付

**新 workspace 域 `src/frontend/packages/`**（应用级包的家——不进根 `packages/`，那里的平台中立门禁是内核域约束；glob 两级：`src/frontend/packages/*` 与 `.../pages/*`）：

| 包 | 内容 | 依赖 |
| --- | --- | --- |
| `@blog/route-input` | 两端共享纯函数（positiveIdFromSearch/positiveFilterIdFromSearch/displayDate） | 无 |
| `@blog/desktop-api` | desktop foundation/api 全量（client 515L + types 276L）+ useDesktopResource 数据钩子 | core/loom query+port/zod + solid(peer) |
| `@blog/desktop-shared` | 共享 widget ArticleBody（text-highlight）+ search model | desktop-api + text-highlight + solid(peer) |
| `@blog/page-desktop-detail` | **试点页面包**：`.` 声明出口（definePage 元数据，node 安全）+ `./page` 组件出口（页面 83L + 私有 feature 16L） | 上述三包 + page-kit + solid + lucide |

**registry 演进为聚合产物**：`pages.registry.ts` 以 `aggregatePage(PageMetadata, 构建域)` 把页面包声明聚合进注册表——页面说"我是谁"，宿主说"怎么构建"（outputPath/entry 留宿主）；聚合插回原序，**site-routes.json 零 diff**。

**宿主 shim 层**（16 个未迁移页面零改动）：foundation/api、foundation/resource、widgets/article-body、features/search、validation/route-input 均变薄转发；`desktop/pages/detail/` 与 `desktop/features/detail/` 删除（进包）。

**definePage 落定（P3b 遗留项）**：page-kit root 提供 `PageMetadata` + `definePage` + `siteRoute`（语义路由纯函数）。**关键架构课（实施中被 node 现场教育）**：初版 definePage 耦合元数据与组件工厂，注册表在 CLI/测试/构建期 import 页面包时把 css 副作用拉进 node 报错——**拆双出口**：`.` 纯声明（注册表用，node 安全），`./page` 组件（入口/构建用）。这就是"页面是什么"与"怎么造"的物理分界。

**foundation 归属闸门（本阶段核心决策）**：按试点真实依赖面定——**api 层抽包**（`@blog/desktop-api`，页面包的硬依赖）、**跨端纯函数抽包**（route-input）、**共享 UI/feature 抽包**（desktop-shared）、**styles 暂留宿主**（页面样式由入口 css 装配，不进页面包）。移动端 api 层（`@blog/mobile-api`）待 P3d 首个 mobile 页面包时同构抽取。

## 验证证据

| 项 | 结果 |
| --- | --- |
| page:check | 17 页/22 alias，**清单与投影一致（零 diff，聚合保序）** |
| typecheck | 前端 0 错、root 0 错、tests/app tsconfig 补 packages+vite-env 后 0 错 |
| test:frontend | 48/48；test:foundation 仅既有 2 条 in-flight 违例，零新增 |
| vite build | ✓（1.64s） |
| ops 套件 | 128 项 0 失败；`ops package check` 三段全绿 |
| **e2e（integration 实跑）** | **试点页以包形态通过真实浏览器**（desktop-articles/desktop-detail 截图产物齐，含首绘零 site-routes 请求断言）；唯一失败仍为既有 mobile-home（in-flight） |
| lint/format | 仅既有 2 条（navigator 系） |

## 实施注记

- pnpm 嵌套 workspace glob 需逐级声明（`packages/*` 不覆盖 `packages/pages/*`）；
- 页面包 index import `./page.ts` 笔误（实际 .tsx）被 node 解析当场抓住；
- tests/app/tsconfig 需补 `packages/**` 与 `vite-env.d.ts`（css 副作用导入的类型声明来自 vite/client）；
- pnpm 11 的 deps-status-check 会在 CI 模式自动 install：改动依赖后必须显式 `pnpm install --no-frozen-lockfile` 落盘锁文件。

## 后续（P3d）

- 其余 16 页按试点模式分批迁移（mobile 侧先抽 `@blog/mobile-api` 与 mobile-shared）；
- `ops page new` 脚手架改为生成页面包骨架（definition/page 双出口）；
- shim 层随消费者直连逐步拆除；页面包测试归属（宿主 tests vs 包内 test）随第二包定型。
