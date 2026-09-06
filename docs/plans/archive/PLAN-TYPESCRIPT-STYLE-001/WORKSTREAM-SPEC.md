---
kind: workstream
id: WORKSTREAM-TYPESCRIPT-STYLE-SPEC
status: completed
plan_id: PLAN-TYPESCRIPT-STYLE-001
role: product-and-engineering
owner: product-and-engineering
depends_on: []
write_set: [docs/guides/, docs/specs/]
last_reviewed: 2026-09-05
---

# 规范、例外与示例

## 目标

把“降低认知复杂度”转成可评审、可引用、可执行的 TypeScript 规则。

## 输出

- `docs/guides/typescript-style.md`；
- code review checklist；
- 正反例和例外说明；
- 新代码与存量代码的适用边界。

## 必须覆盖

- if 卫语句和早返回；
- 三元、`&&`、`||`、`??`；
- 空值和 `undefined/null`；
- Result、异常和错误边界；
- 类型守卫和 union；
- 异步控制流；
- 命名、函数职责和复杂条件；
- 测试、脚本和工具代码。

## 验收

- 规则按必须/建议/允许/例外分级；
- 读者无需了解作者个人偏好即可判断是否符合规范；
- 不要求修改现有业务代码。

## 交付记录

已交付 `docs/guides/typescript-style.md` 和 `docs/guides/typescript-review-checklist.md`，覆盖规则分级、正反例、例外边界、新旧代码适用范围，以及工具扫描后人工 Review 的流程。本工作流未修改业务代码。
