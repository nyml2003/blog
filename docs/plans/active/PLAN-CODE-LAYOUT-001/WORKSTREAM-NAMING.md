---
kind: plan-workstream
id: WORKSTREAM-NAMING
plan_id: PLAN-CODE-LAYOUT-001
owner: frontend
status: ready
last_reviewed: 2026-09-09
---

# 命名治理（R1）

## 职责

消除歧义同名与不携带领域信息的文件名；命名让 grep 结果可区分、目录内容自解释。

## 候选清单（R0 审定后冻结）

| 现名 | 问题 | 建议 | 影响面 |
| --- | --- | --- | --- |
| `ops/src/application/check.ts` | 与 http 检查等含义混淆；实为质量门禁编排 | `quality-check.ts` | registry.ts、测试 |
| `ops/src/domain/runtime.ts` 与 `application/runtime.ts` | 同名歧义（路径可区分但 grep 不可） | domain 侧 `runtime-plan.ts`（纯函数规划矩阵） | 内部 import |
| `http.rs` ×3（product/data/mock） | grep 歧义 | **保留**——crate 名已区分，Rust 惯例入口名 | 无 |

> `desktop/src/app.tsx` 与 `mobile/src/components/ui.tsx` 的问题本质是**混合形态**（组件+工具混放、多导出且彼此不独立），改名治不了本——按文件形态约定（见 PLAN.md）在 R2 拆分，故从本清单移出。

规则：每轮评审补充/删减，**清单外不改**；`http.rs` 类"路径已消歧"的名字不动，避免为改而改。

## Write set

上表"影响面"列出的文件 + `docs/CODEMAP.md` 同步。

## 完成定义

清单执行完毕；`grep -r` 无跨目录同名歧义（白名单除外）；门禁绿。
