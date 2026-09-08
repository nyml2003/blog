---
kind: spec
id: SPEC-CONTENT-TAXONOMY-001
status: draft
owner: project-manager
plan_id: PLAN-CONTENT-TAXONOMY-001
last_reviewed: 2026-09-08
---

# 内容分类树与大模型 PR 工作流

## 目标

建立以内容仓库为真源的分类树和标签模型，并把文章分类整理接入“后端处理大模型变更 JSON、生成单个 PR、用户最终合入”的工作流。Mobile 两个文章入口继续使用 F 型货架：左侧为一级分类，右侧横向 tabs 为当前一级下的二级分类，下面展示文章卡片。

## 决策记录（用户已定）

1. 分类树保存在内容仓库的 `taxonomy.json` 中，先使用 JSON 格式；
2. 分类节点有稳定数字 ID，新增 ID 递增且永不复用被删除、合并或废弃的 ID；
3. `taxonomy.json` 保存分类 ID 水位，不能只扫描当前节点计算新 ID；
4. 文章的 `category_ids` 是数组，但每个 ID 都必须引用叶子分类；一篇文章可以属于多个叶子分类；
5. `tag_ids` 是独立的扁平标签数组，不参与分类树父子关系；
6. 父级分类只负责导航、汇总和货架组织，不能作为文章最终归属；
7. 写文章时作者主要填写标题和正文，分类与标签整理放在发起 PR 的流程中；
8. 大模型生成结构化分类变更 JSON，交给后端处理；大模型不直接拥有最终持久化权；
9. 后端负责校验、分配新 ID、应用分类变更、迁移文章引用并生成规范化结果；
10. 后端把处理后的相关数据和实际 diff 回传给大模型复核一次；最多一轮生成加一轮复核；
11. 大模型可以新增、移动和合并分类节点；合并时同一个 PR 自动迁移所有受影响文章、删除源节点并保留目标节点 ID；
12. 分类树、文章 `meta.json` 变化和正文变化进入同一个 PR；用户是最终审查者和合入者，服务器不自动合并。

## 内容模型

`taxonomy.json` 至少包含：

```json
{
  "version": 1,
  "next_category_id": 8,
  "next_tag_id": 24,
  "categories": [
    { "id": 1, "name": "前端", "parent_id": null, "position": 10 },
    { "id": 2, "name": "React", "parent_id": 1, "position": 10 }
  ],
  "tags": [
    { "id": 11, "name": "性能优化" }
  ]
}
```

文章 `meta.json` 使用稳定引用：

```json
{
  "id": 1001,
  "title": "React 状态管理实践",
  "summary": "……",
  "category_ids": [2],
  "tag_ids": [11]
}
```

后端必须保证分类树无环、引用存在、文章分类数组去重且非空时全部为叶子节点。父级汇总查询需要按文章 ID 去重，避免文章属于同一父级下多个叶子时重复展示。

## 大模型变更闭环

后端向模型提供当前 taxonomy、ID 水位、待处理文章正文和元数据，以及必要的已有分类上下文。模型返回版本化变更 JSON，表达新增、移动、重命名、合并、文章分类数组调整和标签调整。

后端应用前先校验变更；新增分类 ID 由后端按水位分配，模型不能伪造最终新 ID。移动和重命名保留节点 ID。合并要求显式 source/target ID，目标 ID 保留，源节点删除，所有受影响文章的 `category_ids` 在同一批次中替换并去重。

后端应用后生成规范化 taxonomy、文章元数据和变更 diff，并把实际结果、被接受或拒绝的操作及错误警告回传模型复核。复核只能再产生一轮变更 JSON；复核通过后才创建或更新唯一活跃 PR。任一轮无法通过后端校验则不创建 PR，保留工作区并报告原因。

## Mobile F 型货架

- `/m/articles/index.html` 和 `/m/articles/list.html` 都是 F 型；
- 左侧 `shelf-index` 是一级分类；
- 右侧内容区的横向 tab 是当前一级分类的二级分类；
- 下方是当前二级分类对应的文章卡片列表；
- 选择一级时汇总该一级所有后代叶子分类，选择二级时筛选该二级及其后代叶子分类；
- 同一篇文章属于多个叶子分类时，在父级汇总中只展示一次；
- 页面不得把这套布局实现成顶部全局 T 型筛选。

## 非目标

- 本计划不实现图片、RSS、SEO、评论、PWA 或阅读增强；
- 不改变用户最终合入 PR 的权限；
- 不把大模型调用结果直接写入线上数据库；
- 不复用已删除分类 ID；
- 不把 `tag_ids` 推断为分类树父子关系；
- 不在本计划内自动合并 PR 或建立定时分类任务。

## 场景

### SPEC-CONTENT-TAXONOMY-001-001

Given 内容仓库存在分类树和历史 ID 水位

When 新增分类

Then 后端分配大于历史水位的新 ID，并更新水位；已删除 ID 永不复用

### SPEC-CONTENT-TAXONOMY-001-002

Given 文章需要多个知识领域归属

When 保存文章元数据

Then `category_ids` 可以包含多个 ID，但每个 ID 都存在且是叶子节点；父级 ID 被拒绝

### SPEC-CONTENT-TAXONOMY-001-003

Given 大模型分析文章和现有分类树

When 模型返回变更 JSON

Then 后端校验并应用新增、移动、合并和文章引用变更，生成规范化 diff

### SPEC-CONTENT-TAXONOMY-001-004

Given 分类合并请求

When 后端处理 `source_category_id -> target_category_id`

Then 同一批次迁移全部受影响文章、去重 `category_ids`、删除源节点并保留目标 ID

### SPEC-CONTENT-TAXONOMY-001-005

Given 后端已经应用一轮模型变更

When 回传结果给大模型

Then 最多允许一次复核；复核通过后分类树、文章元数据和正文进入同一个 PR

### SPEC-CONTENT-TAXONOMY-001-006

Given 用户打开 Mobile 文章入口

When 选择左侧一级或右侧二级

Then 页面保持 F 型布局，按分类树筛选并去重展示文章卡片

## 边界与失败

- 分类树出现环、重复 ID、重复名称冲突、非法父节点或悬空文章引用时，整批拒绝；
- 文章只引用父级分类、不存在分类或已废弃分类时，整批拒绝；
- 模型生成 JSON 无法解析或复核仍不满足约束时，不创建或更新 PR；
- 合并目标不存在、源节点不是可合并节点或迁移后文章没有合法叶子分类时，整批拒绝；
- PR 创建失败不回退已校验的工作区结果，也不得创建第二个活跃批次；
- 用户未合入 PR 前，线上公开内容和分类树保持不变。

## 测试/验收证据

- 自动化测试已完成：覆盖 taxonomy schema、ID 水位、叶子引用、树环、合并迁移、模型变更 JSON、单 PR 批次一致性、同步恢复和公开快照隔离；
- 真实 GitHub 集成已完成：PR #1 合入后同步到公开快照，合入后新增的本地 article 2 保留为下一批并进入仍 open 的 PR #2；公开端只出现 article 1；
- 浏览器自动化已完成：[报告](../plans/active/PLAN-CONTENT-TAXONOMY-001/evidence/browser/report.json) 通过，覆盖登录、工作区 active PR、公开端隔离、Desktop 和 Mobile 无溢出及页面错误；
- 完整证据与环境边界见计划的 [EVIDENCE.md](../plans/active/PLAN-CONTENT-TAXONOMY-001/EVIDENCE.md)；
- 人工验收仍由用户完成：审查当前 PR diff、确认最终行为并决定是否合入；完成前 Spec 保持 draft，计划不归档。
