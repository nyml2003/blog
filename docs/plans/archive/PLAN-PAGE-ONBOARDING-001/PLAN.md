---
kind: plan
id: PLAN-PAGE-ONBOARDING-001
status: completed
owner: project-manager
created: 2026-10-03
last_reviewed: 2026-10-03
---

> **后续状态标注（2026-10-04）**：本计划交付的校验器/生成器已搬入 `@fluvient-loom/page-build-kit` 包（PLAN-PAGE-PACKAGING-001 P3a）；校验器的 `entryExists` 依赖随统一入口落地退役（纯函数化）；CI 步骤经 `nix develop ./nix -c ops page check` 实跑验证。本文保留为历史执行记录。

# 页面接入 P1：校验、生成与桌面端首绘内嵌（试点：桌面文章详情页）

## 目标

把 [PLAN-PAGE-DISCOVERY-001](../PLAN-PAGE-DISCOVERY-001/PLAN.md) 的决策落成第一批可验收能力（对应 DECISIONS D2/D3/D4/D8 + D11 接缝 + D10 的 P1）：

1. **校验器**：页面注册表语义校验，内部消费归一化形态 `{ pageId, variant, outputPath, entry }`（variant 为开放 key 占位，平台世界由 entry/outputPath 路径派生并校验一致性——D11 接缝，registry 现有单实现 schema 不变）；覆盖 id/alias/outputPath 唯一、**alias×outputPath 交叉冲突（全链路首次存在）**、entry 文件存在、alias/outputPath 格式；
2. **site-routes.json 生成器**：registry → 清单，canonical = `aliases[0]`；一次性重排 registry 中不满足约定的 alias 顺序（已知 mobile-home 为 `/m` 在前而现状清单为 `/m/`），目标**生成结果与现状清单零 diff**（证明幂等 + 零行为变化）；守卫测试从"双向集合校验"升级为"重新生成 + 比对"；
3. **三入口接线**：vite 配置加载期 fail fast（坏注册表 → dev 拒绝启动、build 失败）；
4. **`ops page check`**：新 `page` 命令域首命令，包装同一校验器 + 生成比对，退出码与输出符合 ops 输出规范；CI build-release workflow 增加该步骤；
5. **Desktop 首绘内嵌（D8）**：desktop bootstrap 改为构建期内嵌清单（与 Mobile 同构），不再运行时请求 `/api/public/site-routes`；端点保留；schema 守卫测试从只点名 mobile id 扩展为全部 id；
6. **Spec 修订**：SPEC-SITE-ROUTES-001——registry 为事实源、清单为生成物、两端内嵌为默认、运行时端点保留；
7. **试点验收**：`desktop-public-detail`（桌面文章详情页）作为垂直切片走全链验收。

## 试点语义

"接入桌面端文章详情页"= 以现有 `desktop-public-detail` 注册页为 P1 的验收试点（dev 重写、build 产物、e2e 首绘断言），不是新建或重写该页面。若后续意图为重写详情页，另立计划。

## 成功标准

1. 校验器单测覆盖每类错误，且各有一次"注入坏条目 → 被拦截"的变红演练证据；
2. dev/build fail fast：坏注册表使 vite 拒绝启动（记录命令与输出）；
3. 生成器幂等：连续生成两次内容一致；首次落地后 `git diff` 仅含预期变更（canonical 重排后与现状清单零 diff）；
4. `ops page check`：合法通过、非法非零退出并输出结构化错误；CI workflow 步骤执行通过一次（含证据）；
5. Desktop 内嵌：全部 11 个 desktop 页面首绘不再发 `/api/public/site-routes` 请求；e2e 对 desktop-public-detail 断言该请求不出现；既有全部 e2e 不回归；
6. SPEC-SITE-ROUTES-001 修订后与实现一致（文档声称与运行结果相符）；
7. `ops quality check` 通过；与 PLAN-MOBILE-PERSISTED-STATE-001 等进行中计划写集零重叠（`src/frontend/package.json` 除外：仅追加 script 行，基于最新工作区内容修改）。

## 非目标

- 脚手架 `ops page new`（P2）、page-kit 运行时包与 definePage（P3）；
- `implementations` 多实现 schema 迁移（D11 停泊，本计划只落归一化接缝）；
- Rust UA 分流、`Vary: User-Agent`（另立计划）；
- 移动端页面行为变化（Mobile 已内嵌，不动）；
- 后端接口与静态服务逻辑变更（`/api/public/site-routes` 端点保留，static_files 不动）；
- registry 字段增删（保持现有 schema；`platform` 字段维持现状，其派生校验在归一化层实现）。

## 约束与依据

- 决策：DECISIONS D2（生成物 + `aliases[0]`）、D3（三入口单一校验器）、D4（平台一致性，降为实现级派生校验）、D8（Desktop 内嵌）、D11（归一化形态接缝）、设计原则（声明可重复、机制须复用）；
- Spec：SPEC-SITE-ROUTES-001（本计划修订对象）、SPEC-ARCH-BOUNDARY-001（不触碰）；
- 事实：INVENTORY §1（插件耦合）、§2（字段消费）、§3（投影链）、§6（校验矩阵）、§8（Desktop 首绘）；
- 相关计划：PLAN-MOBILE-PERSISTED-STATE-001（进行中，写集见成功标准 7）。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 校验器与归一化形态 | frontend | - | `src/frontend/`（registry 旁新建校验模块 + 单测） | ready |
| 生成器与 canonical 重排 | frontend | 校验器 | 生成器模块、`site-routes.json`、`pages.registry.ts`（alias 重排）、`tests/vite-plugins/page-template.test.ts`（守卫改造） | blocked by 校验器 |
| vite 接线 fail fast | frontend | 校验器 | `vite.config.ts` | blocked by 校验器 |
| `ops page check` + CI | pm | 校验器、生成器 | `apps/blog/src/registry.ts`、`apps/blog/src/`（新 page 命令域模块）、`.github/workflows/build-release.yml`、`src/frontend/package.json`（追加 script） | blocked by 生成器 |
| Desktop 内嵌 + Spec 修订 | frontend | 生成器 | `bootstrap/desktop/environment.tsx`、desktop foundation schema 复用、`tests/vite-plugins/page-template.test.ts`（守卫扩展）、`docs/specs/SPEC-SITE-ROUTES-001.md` | blocked by 生成器 |
| 试点验收与收尾 | pm | 全部 | e2e 断言、`RESULT.md`、`docs/plans/README.md`、CODEMAP/README 同步 | pending |

串行依赖链为主（校验器 → 生成器 → 其余三项可并行），单一 owner 即可推进；Desktop 内嵌与 ops/CI 并行时写集不相交。

## 集成验收

- `ops quality check` 全量通过（跨模块、含运行时链路改动）；
- `ops e2e` 全量通过，新增 desktop-public-detail 首绘无 site-routes 请求断言（修复前变红、修复后转绿证据留档）；
- 变红演练证据：坏注册表分别在 dev 启动、build、`ops page check` 三处被拦截的输出记录；
- CI：build-release workflow 含 `ops page check` 步骤并实际跑通一次（推送或 dispatch 证据）。

## 未决项

- canonical 重排后 `/m` 与 `/m/` 两个 alias 均仍注册可用，对 SEO 已收录地址无破坏（均可达），生成清单值变化为 `/m/`（与现状一致）——落地时以生成 diff 复核；
- persisted-state 第二阶段收尾时点（用户确认，不阻塞本计划）；
- P2（脚手架）、P3（page-kit）派生时点：P1 验收通过后另立。
