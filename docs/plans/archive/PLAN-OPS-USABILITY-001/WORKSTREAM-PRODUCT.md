---
kind: workstream
id: WORKSTREAM-OPS-USABILITY-PRODUCT
status: completed
plan_id: PLAN-OPS-USABILITY-001
role: product
owner: product
depends_on: []
write_set: [docs/guides/, docs/specs/]
last_reviewed: 2026-09-05
---

# 命令发现与帮助信息架构

## 目标

定义开发者首次使用 ops 时需要看到的命令清单、组织方式、推荐路径和错误引导。

## 输出

- 根帮助信息结构；
- 分组和叶子命令的说明标准；
- 常见错误的引导文案；
- `SPEC-*` 帮助和错误场景。

## 验收

- 不读源码即可找到当前所有叶子命令；
- 每条命令的用途、输入、选项和下一步都可理解；
- 文案不承诺当前不存在的能力。
