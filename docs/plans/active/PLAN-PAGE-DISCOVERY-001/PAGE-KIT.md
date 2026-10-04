# page-kit 包形态（讨论稿）

> 状态：讨论稿，不是 Spec，不自动生效。对应计划见 [PLAN](./PLAN.md)；发现机制议题见 [DISCOVERY](./DISCOVERY.md)。
> 用户已决策（2026-10-03）：接入方为**仓内新增页面提效**，不做跨仓库复用、不发布 npm。

## 1. 先回答：每个页面一个 npm 包，为什么不做

npm 包的立项判据是至少满足其一：**多个消费者**、**独立发布节奏**、**独立安装上下文**。本仓库的页面三者皆无：

1. **单消费者**：每个页面只有构建链一个消费方，同仓、同构建、同发布（`pages.registry.ts` 是单一事实源）；
2. **页面不是自包含单元**：FSD 切片结构下，一个页面横跨 `pages/` + `widgets/` + `features/` + `foundation/`（`SPEC-ARCH-BOUNDARY-001` 门禁约束依赖方向）。装成包要么整摞打包（foundation 重复、门禁被架空），要么导出杂烩；
3. **构建链前提**：HTML 生成、shell 预渲染、引导注入、路由投影都以 frontend 根内路径为前提，页面进 node_modules 会让 Vite 入口、tsconfig、门禁全面复杂化，收益为零。

旁证：仓内现有 16 个包全部按**能力**切（`port`/`query`/`command`/`net`/`web`/`app-shell`/`persisted-state`/`cli-kit`/…），没有一个按页面切——项目自己的惯例已经回答了这个问题。

## 2. kit 的候选内容

真正要解决的是现状的重复：每个页面的 bootstrap 入口文件（10–40 行样板：输入解析、store 创建、mount、返回策略）和三个 slice 目录的手工建立。

| 候选内容 | 来源 | 说明 |
| --- | --- | --- |
| 环境装配 + `mountXxxPage` | `bootstrap/{mobile,desktop}/environment.tsx` | 70 行宿主装配已收敛为一个 mount 函数；下沉进包后应用侧不再直接装配 `@fluvient-loom/web`（边界影响见 §4） |
| `definePage()` | 新增 | 把入口文件压到 ~5 行：声明式提供输入解析、依赖创建（如 favorites store）、返回策略；现有入口如 `bootstrap/mobile/detail.tsx` 是重构样本 |
| 页面输入解析 helper | `bootstrap/mobile/detail-input.ts` 等 | 对齐 PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001 的边界归一化先例 |
| `AppShellSpec` re-export | `@fluvient-loom/app-shell` | 已存在，kit 仅聚合导出，registry 侧照常消费 |
| **脚手架** `ops page new` | `apps/blog` | 一条命令生成 registry 条目 + 入口文件 + 三个 slice 模板；**这是接入成本的最大杠杆**，且让 DISCOVERY 方向 A 的"三步登记"机械正确 |

结构建议：kit 内部按平台分子路径导出（`./mobile`、`./desktop`），共享仅限无 UI 逻辑——两端 UI 隔离是 `AGENTS.md` 稳定边界，包内部同样不得互串。

## 3. 业界参考

### 3.1 npm 包工程

- **exports 子路径**：仓内所有包已在用（`./*`、`./styles.css`），kit 沿用即可；
- **宿主框架用 peerDependencies**：`solid-js` 由宿主提供——`mobile-h5-solid-atoms`、`persisted-state` 是现成先例，kit 照抄；
- **monorepo private 先内后外**：全部 `private: true` + `workspace:*`；npm 发布在 PLAN-FRONTEND-INFRASTRUCTURE-PACKAGES-001 收尾记录中已是未决策项，本 kit 不改变这一点。

### 3.2 框架 kit 先例

- **`@nuxt/kit`**：框架把自身能力（钩子、装配、工具）以包形式暴露给模块作者，模块不触碰框架内部——与本 kit"页面作者不触碰宿主装配"同构；
- **Astro integrations / SvelteKit hooks**：同一模式的变体，说明"kit = 框架的公共 API 层"是成熟做法，前提是 kit 背后有稳定契约（这里即 `SPEC-ARCH-BOUNDARY-001` 的修订版）；
- **create-next-app / create-vue / plop**：脚手架生成器是"低成本接入"的主要解，运行时 SDK 只解决一半问题。

### 3.3 命名

- 仓内已有 `@fluvient-cli/cli-kit`；对齐惯例推荐 **`@fluvient-loom/page-kit`**；
- `devkits` 语义偏向开发期工具（脚手架、lint），而 mount/装配是运行时能力，混在一个名字里会模糊包的职责；
- 折中方案：运行时叫 `page-kit`，将来脚手架若独立成包再按能力命名（如 `page-scaffold`），不预建空壳包。

## 4. 边界影响（需要明确决策的架构点）

1. **bootstrap 的"唯一装配层"规则移动**：现行规则是 bootstrap 是唯一允许装配 `@fluvient-loom/web` 适配器的层（`SPEC-ARCH-BOUNDARY-001` + source-layout 门禁）。kit 吸收 environment 装配 = 这条边界下沉到包内部。**这是本讨论最重的架构决策**：需要修订 Spec、同步门禁测试，且理由必须是"消灭每页重复装配"（真实收益）而非"把代码挪进包好看"；
2. **两端隔离**：kit 必须 `./mobile` 与 `./desktop` 子路径导出，包内不互导 UI（同 §2）；source-layout 门禁需要把"两端互不导入"的执法面延伸到包边界；
3. **vite-plugins 是否随 kit 下沉**：`page-template.ts`/`page-bootstrap.ts` 签名已接受 `registrations` 注入，技术上可下沉。但消费方只有本应用，当前下沉零收益；默认推荐**不动**，等第二个消费场景出现；
4. **foundation/api 是否纳入 kit**：BFF 归一化是无 UI 契约，理论上可共享；但两端 API 面不同且分属各自 foundation，第一版默认不动。

## 5. 待决策问题（附默认推荐）

1. **边界移动**：接受 §4.1（kit 吸收装配，修订 Spec + 门禁），还是保守方案（kit 只提供 `definePage`/helper，装配留在 bootstrap，零边界变更）？默认推荐：接受移动，一次把重复消灭；
2. **`definePage` API 形状**：默认推荐对齐现有 `MobilePageContext` 注入风格（对象参数 + 命名依赖），在实现 Plan 里以 2–3 个现有页面为重构样本定稿；
3. **脚手架归属**：默认推荐 `apps/blog` 新增 `ops page` 命令域（对齐现有命令域组织），不独立成包；
4. **命名**：默认推荐 `@fluvient-loom/page-kit`（§3.3）。
