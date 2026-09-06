---
kind: guide
id: GUIDE-SPEC-DRIVEN
status: current
owner: project-manager
last_reviewed: 2026-09-05
---

# Spec 驱动指南

Spec 使用 Markdown 场景和稳定 ID，不引入 Gherkin 解析器：

```text
SPEC-ARTICLE-001

Given ...
When ...
Then ...
```

## 渐进强度

- `Spike`：记录问题、时间盒和观察，默认隔离；
- `Build`：记录目标、非目标和最小行为场景；
- `Acceptance`：补齐边界、测试映射和验收证据。

跨职能行为、公共 API、数据状态和计划验收项必须有稳定 Spec ID。小型局部改动可以使用轻量场景。
