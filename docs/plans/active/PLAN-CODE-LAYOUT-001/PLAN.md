---
kind: plan
id: PLAN-CODE-LAYOUT-001
status: ready
owner: project-manager
created: 2026-09-09
last_reviewed: 2026-09-09
---

# 代码布局与命名治理（人读优先）

## 目标

解决用户明确提出的两个理解阻塞（2026-09-09）：

1. **通用英文单词**：`app.tsx`、`ui.tsx`、`core.ts`、`client.ts` 等文件名不携带领域信息，`http.rs` ×3、`runtime.ts` ×2 同名歧义；
2. **未按领域边界堆放**：前端查询与客户端是跨领域大杂烩（`queries/public.ts` 436 行、`common/client/client.ts` 819 行），追踪一个领域要跨 6 个目录。

治理后：**找一个领域的东西最多看两个目录；文件名自解释；对页面的 import 面保持不变**。纯重组，零行为变化。

## 文件形态约定（用户 2026-09-09 指定）

前端文件只分两种形态（宽松约定，非硬性限制）：

| 形态 | 定义 | 例 |
| --- | --- | --- |
| **A. 多导出文件** | 导出多个彼此独立的方法/函数：工具库、hook 集、类文件 | `queries/articles.ts`（各查询相互独立）、`common/data/result.ts` |
| **B. 单导出文件** | 只导出一个东西：一个 UI 组件、一个类 | `atoms/button.tsx`、`pages/home.tsx` |

判读细则：

- A 的成员必须**可独立理解与使用**；共享内部状态的一组函数算"类文件"（如 `common/client/site-routes.ts` 的 configure/read 缓存对），允许但需在文件头说明；
- 灰区（如类型+工厂函数、常量表）在 R0 清单中逐个分类，报用户审定；
- 混合形态（组件+工具混放，如 `app.tsx`、`ui.tsx`）是本次治理对象：拆成 B 形态组件文件 + A 形态工具文件。

## 成功标准

1. `solid/queries/` 与 `common/client/` 按领域拆分（articles / shelves / taxonomy / session / content / site-routes 等），`queries/index.ts` 与客户端组合根对页面保持同一出口——**页面文件零改动**；
2. W1 命名清单执行完毕：歧义同名与无领域信息文件名清零（清单经用户审定）；
3. 拆分后前端文件符合两种形态约定（A 多导出且成员独立 / B 单导出）；
4. 全量门禁绿（含架构边界扫描）；既有全部测试绿作为零行为变化护栏；
5. [CODEMAP](../../../CODEMAP.md) / [GLOSSARY](../../../GLOSSARY.md) / `docs/architecture/frontend.md` 与最终布局同步，文件形态约定经 R3 提升进 `docs/guides/typescript-style.md`。

## 非目标

- 后端 crate 与目录重组：Cargo crate = 进程边界，是门禁规则的承重墙，本计划不碰；
- 任何行为、契约、API、UI 变化；
- 依赖升级、格式化大扫除等顺手动作（保持最小范围）。

## 约束与依据

- 依据：用户 2026-09-09 表达的布局痛点与方案选择（A+B+C：导航 + 命名 + 前端重组）；
- 导航层（CODEMAP / GLOSSARY）已先行交付，本计划只做代码侧；
- 写集：与四个 acceptance 状态计划无重叠（它们不再改代码）；重命名一律 `git mv` 保 blame 连续；每个工作流独立提交可回退；
- 架构边界扫描（`ops/src/domain/architecture.ts`）按目录前缀匹配，目录级规则不受文件拆分影响；如引用具体文件名则随改。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 命名治理（R1） | frontend | R0 清单审定 | 见 [WORKSTREAM-NAMING.md](./WORKSTREAM-NAMING.md) | ready |
| 前端领域拆分（R2） | frontend | R0 清单审定 | 见 [WORKSTREAM-DOMAIN-SPLIT.md](./WORKSTREAM-DOMAIN-SPLIT.md) | ready |
| 门禁与文档同步（R3） | infra | R1、R2 | 见 [WORKSTREAM-SYNC.md](./WORKSTREAM-SYNC.md) | ready |

## 轮次与验收

| 轮 | 内容 | 验收 |
| --- | --- | --- |
| R0 | 产出"命名清单 + 拆分清单 + 文件形态分类表"（改什么、改成什么、为什么、每个产物是 A 还是 B 形态） | **报用户审定后才动代码** |
| R1 | 执行命名清单，同步 import 与测试引用 | 门禁绿；同名歧义清零 |
| R2 | 按领域拆分 queries 与 client，混合文件按形态约定拆开，出口不变 | 门禁绿；页面文件 git diff 为空 |
| R3 | 门禁规则引用、架构文档、CODEMAP/GLOSSARY 同步；形态约定提升进 typescript-style.md | 文档与代码一致 |

## 集成验收

见 [ACCEPTANCE.md](./ACCEPTANCE.md)。用户最终验收后推进 spec（如有）并归档。

## 未决项

- `queries/core.ts` 与 `ops` 侧若干通用名是否纳入本轮重命名，由 R0 清单审定决定。
