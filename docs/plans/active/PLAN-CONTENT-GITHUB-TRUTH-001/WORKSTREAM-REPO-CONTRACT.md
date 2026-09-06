---
kind: workstream
id: WORKSTREAM-REPO-CONTRACT
status: ready
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
role: backend
owner: backend
depends_on: []
write_set:
  - docs/content-repo/CONTRACT.md
  - src/backend/data/src/content/
  - src/backend/data/src/content/tests/
  - docs/specs/SPEC-CONTENT-GITHUB-TRUTH-001.md
  - docs/plans/active/PLAN-CONTENT-GITHUB-TRUTH-001/
last_reviewed: 2026-09-06
---

# 工作流：仓库契约与存量迁移

## 目标

设计并冻结内容仓库契约（布局 / frontmatter / taxonomy / 资产约定），实现仓库内容解析器与存量 SQLite 数据的一次性迁移工具。**契约设计稿须用户审定后冻结。**

## 输入

- Spec：`SPEC-CONTENT-GITHUB-TRUTH-001` 契约节；
- 现有数据模型：`Article`（title/summary/articleTypeId/termIds/contentHtml/status/时间戳）、taxonomy（types/terms）；
- Rust HTML profile 校验（`src/core/protocol`）作为导入内容门禁。

## 输出

- `docs/content-repo/CONTRACT.md`：目录布局、frontmatter 字段与类型、taxonomy 配置格式、图片资产约定、版本化与变更规则（布局冻结条款）；
- 解析器 crate 模块：仓库工作区 → 领域模型（含 HTML profile 校验、非法内容诊断），纯函数可单测；
- 存量迁移工具：读现有 SQLite → 生成仓库文件树（含 taxonomy 配置），输出 round-trip 校验报告；
- dev / mock 形态设计稿（fixture 仓库 vs mock API），报用户审定。

## 实施任务

1. 契约设计稿 → 用户审定 → 冻结；
2. 解析器 + 校验集成 + 单测（含非法 frontmatter / 非法 HTML 用例）；
3. 迁移工具 + round-trip 测试；
4. dev 形态设计稿报审。

## 测试/验收

- 解析器单测全绿；迁移 round-trip：存量数据 → 仓库 → 解析 → 与原数据一致；
- 契约文档经用户签字冻结。

## 阻塞

无（本工作流是全计划起点）。

## 交付记录
