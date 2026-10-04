---
kind: plan
id: PLAN-PAGE-ONBOARDING-002
status: completed
owner: project-manager
created: 2026-10-03
last_reviewed: 2026-10-03
---

> **后续状态标注（2026-10-04）**：本计划的脚手架 `ops page new` 已被"抽象单位是接口，不是模板"决策**退役**（见 PLAN-PAGE-DISCOVERY-001 DECISIONS 顶部修订第 6 条）：全部文本手术与模板生成删除，新页面接入改为"建包 + 实现 definePage 接口 + 注册表两行（人写）"。本文保留为历史执行记录——当时的"校验先行、违例零落盘"设计原则仍被后续体系继承（校验器成为三入口执法件）。

# 页面接入 P2：脚手架 ops page new

## 目标

落地 DECISIONS D5 的第二半：`ops page new` 一条命令完成新页面的全部接入动作，生成物**立即通过 P1 的校验器与全部守卫**。承接"该重复时重复"原则——脚手架生成的是允许重复、可各自演化的声明样板，不是框架机制。

一条命令产出：

1. `pages.registry.ts` 新条目（插入到同平台组的末尾，保持 desktop→mobile 分组）；
2. bootstrap 入口文件（desktop 为 5 行恒等透传样板；mobile 为 app.css + 全量 context 透传或最小页面接线样板）；
3. `pages/<slice>/page.tsx` 最小页面组件（不依赖 shell 组件——mobile shell 家族正处于 persisted-state 计划改造中，模板只依赖稳定的 foundation/context 窄接口）；
4. 重新生成 site-routes.json（复用 P1 生成器）；
5. 同步 `page-template.test.ts` 的冻结 alias 清单（追加对应行，保持顺序一致）。

## 关键设计

- **校验先于写入**：以"当前注册表 + 假想条目"先跑 `validatePageRegistry`，有违例（id/alias 冲突、格式）则不写任何文件；目标文件已存在同样拒绝；
- **模板贴着守卫写**：入口文件满足 page-template.test 的形态断言（`mountXxxPage(...)` 调用、mobile 恰一次 app.css import、不直接操作 DOM）；mobile 页面用 `MobileRouteContext`（不触 MobilePageContext，避开 source-layout 门禁）；
- **实现归属**：模板与装配逻辑在 `src/frontend/page-registry/scaffold.ts` + CLI `scaffold-new.ts`（`pnpm page:new`），ops 命令包装（对齐 P1 的 page-check 模式）；注册表插入为文本操作（同平台组末尾锚点），插入后经 biome 格式化；
- **ops 参数显式**：`--platform`（enum）、`--id`、`--title`、`--alias` 全部必填（SPEC-OPS-PARAMETERS-001）。

## 成功标准

1. `ops page new --platform mobile --id <x> --title <t> --alias <a>` 后：`pnpm page:check` 通过、site-routes.json 已含新页、`test:frontend` 通过（冻结清单已同步）、`vite build` 通过；
2. 非法输入（重复 id、重复 alias、坏格式 id、文件已存在）在写入任何文件前被拒绝并输出校验器明细；
3. 单元测试覆盖：模板生成（两平台）、注册表插入（顺序与格式）、校验先行、幂等拒绝；ops 包装命令测试（含 dry-run 不写文件）；
4. 生成的样板上手即改：入口与页面文件是普通声明代码，无新概念；
5. 既有验证不回归（本计划不触碰 persisted-state 进行中的文件）。

## 非目标

- 不做 widgets/features 模板（页面需要时自建，避免为空壳预建目录）；
- 不生成 shell/导航接线（mobile shell 改造中，模板保持最小）；
- 不做删除/重命名页面命令（`page check` 负责合法性，删改仍手工）；
- 不动 P3 范围（page-kit、definePage）；
- 不实际向 registry 添加任何真实新页面（验证用临时副本与测试完成）。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| scaffold 模块 + CLI + 模板 | frontend | - | `src/frontend/page-registry/scaffold.ts`、`scaffold-new.ts`、`index.ts`、package.json scripts | in-progress |
| 单元测试 | frontend | scaffold | `src/frontend/tests/page-registry/scaffold.test.ts` | pending |
| ops 命令 `page new` | pm | scaffold CLI | `apps/blog/src/page/page-new.ts`、`registry.ts`、`apps/blog/test/commands/page-new.test.ts` | pending |
| 验证与收尾 | pm | 全部 | 临时目录全链验证、`RESULT.md`、plans README、CODEMAP | pending |

## 集成验收

- 以 `--dry-run` 与真实临时执行（复制源码树副本或事后回退）验证"一条命令后全绿"；
- `ops quality check` 受 persisted-state 既有失败限制，同 P1 处理：记录归属，该计划收尾后复跑。

## 未决项

- 多 alias 输入形态（v1 单 alias，`--alias` 出现多 alias 需求时扩展为数组参数）；
- desktop 页面样式文件约定（现有 desktop 入口各自 import 页面 css？核实后决定模板是否含样式行）。
