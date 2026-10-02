---
kind: plan
id: PLAN-MOBILE-PERSISTED-STATE-001
status: in-progress
owner: project-manager
created: 2026-10-02
last_reviewed: 2026-10-02
---

# Mobile 持久化 UI 状态能力与 SOP（收藏修复先行）

## 目标

修复 Mobile 详情页收藏状态不恢复的缺陷，并把"同步持久化 UI 状态"沉淀为一条可完形填空的开发路径，使后续同类需求（阅读位置、UI 偏好等）按 SOP 填空即可写出正确代码。

本轮交付（2026-10-02 经用户决策调整为两阶段：原语先落 workspace 包独立验收，前端接入后行）：

1. 新建 workspace 包 `@fluvient-loom/persisted-state`（`packages/persisted-state/`）：轻量响应式持久化原语 `createPersistedRecord`（创建时读一次、写透传、parse 永不抛错、写失败回读；`set/update` 返回现有 `Result` 体系的失败，序列化与底层抛错均被归一化），使用前提（必须在页面 bootstrap 同步创建）写入 doc comment；包单测、`package.json`、README、`tsconfig` 齐备；`apps/blog` 平台中立护栏为其登记 solid-js 白名单（对齐 `mobile-h5-solid-atoms` 先例）；
2. `src/frontend/mobile/features/favorites/favorites-model.ts`：收藏 store，单文档存储 `blog.mobile.favorites.v1`，接口只暴露领域动词 `has`/`toggle`；
3. `MobileNav` 组件契约改造：删除 `favoriteKey` prop 及组件内收藏状态逻辑，改为 `favorite?: { active: boolean; toggle: () => void }`；`persistence` prop 暂留供 `cycleTheme`（theme 收敛后随后续计划移除）；
4. 详情页 bootstrap 接线：`createFavoriteStore(context.persistence)` 进入 page input；
5. 测试与执法：favorites 单测三件套、架构执法测试（收藏存储键字面量只允许出现在 favorites store；`MobileNav` 不再含 `favoriteKey`/收藏读取逻辑；widgets 层全面禁用 persistence 随 theme 收敛落地）、e2e"收藏→刷新→恢复"回归；
6. SOP 文档 `docs/guides/persisted-ui-state.md`：场景分流（同步小状态 / settings 的 desired-state / data task）+ 六步填空清单；`docs/guides/typescript-style.md` 增补反模式条目（禁止用异步到达的 props 值同步初始化 signal；组件不得直接持有 PersistencePort）。

## 计划价值

- **修复用户可见缺陷**：收藏写入有效但状态永不恢复，根因是组件创建时 `favoriteKey` 尚未到达（`createSignal` 一次性求值），读路径实为死代码。
- **消灭 bug 类而非单个 bug**：把"读时机、损坏回退、写失败一致性"收进原语契约；组件层通过契约丧失写错的能力。
- **补齐轻量路径**：settings 三件套是事实模板但属重量级（异步 mutation + scheduler + reconcile），轻场景照抄成本高，导致 `mobile-nav.tsx` 手搓出错；本计划补一条便宜的同步路径并在 SOP 中分流。
- **可执法**：SOP 不靠自觉——source-layout 测试机械拦截 widgets 层直用 persistence。

## 当前基线（2026-10-02 现场核实）

- 缺陷链：`mobile-nav.tsx:37-45` 以 `props.favoriteKey` 一次性求值初始化 signal；`pages/detail/page.tsx:63` 的 `favoriteKey={article()?.id.toString()}` 依赖 `onMount` 后的异步数据（`features/detail/model.ts:95`），首帧必为 `undefined`；文章到达后无人重读存储。
- 存储层无缺陷：`PersistencePort` 为同步接口（`packages/port/src/ports/persistence.ts:9-13`），`packages/web/src/persistence.ts` 直读直写 localStorage。
- settings 三件套位于 `src/frontend/mobile/features/settings/`（`settings-model.ts` 类型/key/normalize、`persistence.ts` 文档 parse/迁移、`page-model.ts` Solid 接线），是重量级样板。
- 已知双真相：`mobile-nav.tsx:68` 的 `cycleTheme` 写遗留 key `blog.mobile.theme`，与 settings 快照 `blog.mobile.settings.v1` 互不知晓；本轮只记录不修改。
- 现有实现写散 key `favorite:<id>`；`PersistencePort` 无枚举能力，散 key 旧数据在技术上不可列举迁移，且该功能从未正确工作过。
- 执法先例：`tests/source-layout.test.ts` 已用文件扫描做布局门禁；移动单测入口为 `src/frontend/package.json` 的 `test:mobile`/`test:frontend`。
- e2e 位于 `apps/blog/src/e2e/e2e.ts`（`ops e2e` 运行），mobile-detail 覆盖在 L298 附近，可挂载收藏恢复断言。
- 关联 active 计划 `PLAN-FRONTEND-CODEC-PERSISTENCE-001`：在建共享 `Codec`/`PersistPlan` 原语（`packages/core`、新 `packages/codec`、`packages/port`），其非目标明确排除业务接入。本计划与其写集零重叠（不触碰 `packages/**` 与 `docs/architecture/`），边界见下节。

## 与 PLAN-FRONTEND-CODEC-PERSISTENCE-001 的边界

- 本计划基于现有 `PersistencePort` 签名工作，不修改 `packages/port`、`packages/web`，不预实现 Codec/PersistPlan。
- `createPersistedRecord` 的 parse/serialize 语义刻意与 CODEC 计划已确认的铁律对齐（只认 string、永不抛错、normalize 可裁未知字段），以便该栈落地后序列化部分平移到 `createJsonCodec`；届时响应式包装是否上收为共享原语，作为对照项进入该计划收尾记录（未决项）。
- 若 CODEC 计划先行完成 persistence 闸门，本计划原语允许直接采用其产出，替换内部实现而保持 favorites store 接口不变；此为加分项，不构成本计划阻塞依赖。

## 本轮范围与非目标

本轮范围：

- `packages/persisted-state/`（新建，第一阶段已交付）及 `apps/blog` 护栏白名单登记（已交付）；
- `src/frontend/mobile/features/favorites/`（新建）；
- `src/frontend/mobile/widgets/shell/mobile-nav.tsx` 收藏契约改造及 `pages/detail/page.tsx`、`bootstrap/mobile/detail.tsx` 接线（`persistence` prop 因 theme 暂留，`ui.tsx`、`pages/settings/page.tsx` 无需变更）；
- `src/frontend/package.json` 增加包依赖；
- `src/frontend/tests/app/mobile/favorites.test.ts`（新建）、架构执法测试、`apps/blog/src/e2e/e2e.ts` 收藏恢复用例；
- `docs/guides/persisted-ui-state.md`（新建）、`docs/guides/typescript-style.md` 反模式条目、`docs/plans/README.md` 索引。

非目标：

- 不迁移 settings 到新原语，不改 settings 行为；
- 不收敛 theme 双真相（`blog.mobile.theme` 遗留 key），只在本计划记录，修复归后续计划；由此 `MobileNav` 本轮保留 `persistence` prop 仅供 `cycleTheme` 使用，收藏逻辑不得再触碰它；
- 不做跨标签页同步、不做服务端收藏、不引入 `@solid-primitives/storage` 或其他新依赖；
- 不修改 `PersistencePort`/`packages/web` 协议；
- 不迁移散 key `favorite:<id>` 旧数据（决策闸门 1）；
- 不把 favorites store 提升进 `MobilePageContext`（单页消费，多页共用时另议）。

## 执行记录

- 2026-10-02 第一阶段（npm 包）完成：`packages/persisted-state/` 落地，包 typecheck + 单测 11/11 通过；原语已改为 `set(value)` + `update(updater)`，返回 `Result`，可观察序列化、写入和读回失败，避免函数值歧义与静默失败；支持领域相等比较以抑制等价值通知，值按不可变数据使用；护栏单测（`@blog/blog` 120 用例）通过；`ops package check` 中 `pnpm check` 通过，中立性扫描为既有误报基线（nix 二进制落后于已修复的源码，源码级护栏经单测证明放行 `@fluvient-loom/*` 与白名单内 solid-js；本包新增 1 条与基线同类，无新增违规类别）。第二阶段（前端接入）进行中。

## 决策闸门

1. **存储形状**：默认单文档 `blog.mobile.favorites.v1`（`Record<articleId, true>`），理由：Port 无枚举能力、列表页未来可复用、文档整体校验/迁移可行；散 key 旧数据放弃（不可列举 + 功能从未正确工作）。若闸门推翻单文档，需同步重估执法测试与 SOP 文中的形状约束。
2. **组件契约形状**：默认单个对象 prop `favorite?: { active: boolean; toggle: () => void }`（一个语义一个 prop，调用点不可拆开误用）；平铺双 prop 为备选。
3. **原语归属**：（2026-10-02 用户决策修订）新建 workspace 包 `@fluvient-loom/persisted-state`，先于前端接入独立验收；solid-js 依赖按 `mobile-h5-solid-atoms` 先例登记平台中立护栏白名单。是否进一步上收/合并到 CODEC 计划产出，仍留待该计划 persistence 闸门落地后对照。
4. **执法点**：source-layout 测试扫描 `src/frontend/mobile/widgets/**` 禁止出现 `PersistencePort`/`persistence` 标识符；不新增强制 lint 规则。
5. **SOP 文档地位**：`docs/guides/persisted-ui-state.md` 按 AGENTS.md 归类为"当前推荐方法"，命令与路径以仓库现状为准，不写入 `FACTS.md`。

## 成功标准

1. 收藏恢复：收藏 → 刷新 → 爱心保持点亮；取消 → 刷新 → 保持熄灭，e2e 断言通过；
2. 损坏回退：存储中非法 JSON / 未知字段 → 界面正常渲染为未收藏，parse 不抛错（单测覆盖：roundtrip、损坏 JSON、toggle 语义含取消后键删除）；
3. 组件契约与执法：`MobileNav` 无 `favoriteKey` 与收藏读取逻辑；收藏存储键字面量全仓仅存在于 favorites store；执法测试存在且通过（含变红演练证据）；widgets 层 persistence 全面禁用留待 theme 收敛时落地；
4. 竞态消灭的结构证据：store 在页面 bootstrap 同步创建，组件不再从异步 props 派生持久化状态（code review 记录确认，不依赖时序）；
5. 既有验证不回归：`src/frontend` 的 `test:mobile`、`test:frontend`、`lint`、`format:check` 通过；跨模块交付收尾跑 `ops quality check`；
6. SOP 文档含分流判断、六步填空清单、settings/收藏两个引用样板，文档链接有效，`git diff --check` 干净；
7. 与 CODEC 计划写集零重叠，边界口径在本计划与该计划可追溯。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 原语与 favorites store | frontend | - | `src/frontend/mobile/foundation/persisted-record.ts`、`src/frontend/mobile/features/favorites/` | ready |
| MobileNav 契约改造与调用点 | frontend | store 接口定稿 | `widgets/shell/mobile-nav.tsx`、`widgets/shell/ui.tsx`、`pages/detail/page.tsx`、`pages/settings/page.tsx`、`bootstrap/mobile/detail.tsx` | blocked by store |
| 单测与执法测试 | frontend | 实现 | `src/frontend/tests/app/mobile/favorites.test.ts`、source-layout 测试 | blocked by 实现 |
| e2e 收藏恢复 | frontend | 实现 | `apps/blog/src/e2e/e2e.ts` | blocked by 实现 |
| SOP 文档 | frontend+pm | 实现、测试证据 | `docs/guides/persisted-ui-state.md`、`docs/guides/typescript-style.md` | blocked by 实现 |
| 收尾与移交 | pm | 全部工作流 | `RESULT.md`、`docs/plans/README.md` | pending |

工作流全部串行、单一 write set 所有者，无并行拆分需求。

## 集成验收

- 收尾运行 `ops quality check`（跨模块、含运行时链路改动），记录命令、退出码与基线区分；
- `ops e2e` 全量通过，新增收藏恢复断言在修复前变红、修复后变红转绿的证据留档 `RESULT.md`；
- 浏览器手动验收：iPhone 视口（375×812）收藏/取消/刷新旅程截图留档；构建与 HTTP 可达性不替代本项。

## 未决项

- `createPersistedRecord` 未来是否上收为共享原语（待 CODEC 计划 persistence 闸门落地后对照决策）；
- favorites store 是否提升进 `MobilePageContext`（出现第二个消费页时触发）；
- theme 双真相收敛方案（`cycleTheme` 直写遗留 key vs settings store 动作化，移交后续计划，本计划 SOP 文档仅作分流示例引用）；
- 散 key `favorite:<id>` 旧数据是否需要任何补救（默认放弃，闸门 1 可推翻）；
- 阅读位置、列表页爱心状态等后续填空场景的需求优先级（不构成本计划范围）。
