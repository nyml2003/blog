---
kind: plan
id: PLAN-CONTENT-TAXONOMY-001
status: archived
owner: project-manager
created: 2026-09-07
last_reviewed: 2026-09-10
---

# 内容分类树与大模型 PR 工作流

## 目标

按 [SPEC-CONTENT-TAXONOMY-001](../../../specs/SPEC-CONTENT-TAXONOMY-001.md) 建立内容仓库中的分类树、标签和文章引用模型，并把大模型生成分类变更、后端规范化处理、一次复核和单 PR 提交流程串起来。同步修正 Mobile 两个文章入口的 F 型货架语义：左侧一级分类、右侧二级 tabs、下方文章卡片。

## 成功标准

1. `taxonomy.json` 能保存分类树、标签、独立 ID 水位和稳定顺序；
2. 分类 ID 递增且永不复用，文章 `category_ids` 只允许叶子分类并支持多值；
3. `tag_ids` 与分类树引用分离，所有引用完整性和无环规则由后端验证；
4. 大模型变更 JSON 可被后端校验、分配 ID、应用、生成规范化 diff，并最多复核一次；
5. 新增、移动、合并分类及受影响文章迁移进入同一个 PR，服务器不自动合并；
6. Mobile `/m/articles/index.html` 和 `/m/articles/list.html` 均为 F 型，一级/二级切换与父级汇总去重符合分类树；
7. 相关 Rust、前端、协议、Mock、工作区和浏览器测试通过，用户可审查最终 PR diff。

## 非目标

- 不实现图片、RSS、SEO、评论、PWA 或阅读增强；
- 不自动合并 PR，不绕过用户 GitHub 合入；
- 不把模型输出直接写入线上数据库；
- 不复用分类或标签历史 ID；
- 不在本计划内修改 `docs/FACTS.md`。

## 约束与依据

- Spec：[SPEC-CONTENT-TAXONOMY-001](../../../specs/SPEC-CONTENT-TAXONOMY-001.md)；
- 内容真源现行约束：[SPEC-CONTENT-GITHUB-TRUTH-001](../../../specs/SPEC-CONTENT-GITHUB-TRUTH-001.md)；
- Mobile 现有浏览契约：[SPEC-MOBILE-BROWSE-IA-001](../../../specs/SPEC-MOBILE-BROWSE-IA-001.md)；
- 事实：`FACT-PRODUCT-001`、`FACT-RUNTIME-001`；
- 依赖：`PLAN-CONTENT-GITHUB-TRUTH-001` 的原始结果仍按部分交付归档；本计划已补齐真实 GitHub、管理 HTTP、工作台和同步恢复，并记录在 [EVIDENCE.md](./EVIDENCE.md)；
- 工作纪律：模型只提出结构化意图，后端拥有 ID 分配、校验和工作区写入权；重叠写集串行。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 内容仓库与协议 | backend | Spec 冻结 | `docs/content-repo/`, `src/core/protocol/`, taxonomy DTO 与 schema | completed |
| Product 规则与模型闭环 | backend-product | 仓库与协议 | `src/backend/product/`, 模型 adapter、workspace、PR orchestration | completed |
| Data 持久化与快照 | backend-data | 仓库与协议 | `src/backend/data/`, taxonomy/article snapshot operations | completed |
| 管理端/工作台 | frontend-desktop | Product 管理接口、ADMIN-AUTH | `src/frontend/desktop/src/`, `src/frontend/solid/queries/` | completed |
| Mobile F 型货架 | frontend-mobile | 分类读取接口、查询层 | `src/frontend/mobile/src/`, `src/frontend/mobile/styles/` | completed |
| 集成与验收证据 | project-manager | 全部工作流 | 本计划目录、Spec 证据、README 状态 | acceptance |

项目经理启动提示见同目录的 [PM-PROMPT.md](./PM-PROMPT.md)。每个工作流必须在启动时声明实际 write set；重叠写集串行交接。

## 轮次与验收

| 轮 | 内容 | 验收 |
| --- | --- | --- |
| R0 | 仓库 JSON、分类树、标签和文章元数据契约冻结 | completed |
| R1 | Product/Data 规则：校验、ID 分配、移动/合并迁移、整批结果 | completed |
| R2 | 模型 adapter：生成一次、后端处理、回传一次复核、失败终止 | completed |
| R3 | 管理工作台接入保存/分析/预览/提交 PR | completed |
| R4 | Mobile 两个 F 型入口接入一级/二级分类货架 | completed |
| 收尾 | 真实 PR、同步、浏览器、门禁和发布隔离证据 | acceptance，等待用户审查 |

## 集成验收

- [x] 分类树和文章元数据在同一工作区批次中保持引用完整；
- [x] 合并分类的源/目标 ID、文章迁移和删除节点可从规范化 diff 与 PR diff 审查；
- [x] 未合入 PR 不改变公开快照：PR #2 保持 open，公开端只有已合入的 article 1；
- [x] 两个 Mobile F 型页面的左侧一级、右侧二级和文章卡片行为由页面计划的自动化与
  [浏览器证据](../PLAN-FRONTEND-PAGE-TEMPLATE-001/evidence/README.md) 覆盖；本计划的四张截图用于发布隔离复核；
- [x] 全量 runtime gate、ops 契约测试和浏览器报告通过；
- [ ] 用户审查当前 PR diff；
- [ ] 用户确认最终产品行为并决定是否合入当前 PR。

详细检查项见 [ACCEPTANCE.md](./ACCEPTANCE.md)，真实运行与环境边界见
[EVIDENCE.md](./EVIDENCE.md)。在用户完成未勾选项目之前，本计划保持 acceptance，不归档。

## 未决项

- 用户对 PR #2 的 diff 审查与处置；
- 用户对管理工作台、公开端隔离和 Mobile 行为的最终确认。
