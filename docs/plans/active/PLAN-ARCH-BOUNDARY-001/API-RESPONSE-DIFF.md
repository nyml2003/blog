---
kind: evidence
id: EVIDENCE-ARCH-BOUNDARY-API-DIFF-001
plan_id: PLAN-ARCH-BOUNDARY-001
status: completed
verified: 2026-09-07
---

# 迁移前后 API 响应对照

## 对照边界

- 迁移前基线：用户确认的提交 `94c5de9`；
- 迁移后版本：本计划当前暂存实现；
- 两端均以 `ops runtime integration` 启动，并使用各自独立的 `semantics=test` 确定性种子数据库；
- 比较规则：同一路径分别请求两端，状态码与完整响应字节必须同时相同；
- `public.t_shelf` 是 `PLAN-FRONTEND-PAGE-TEMPLATE-001` 经用户确认新增的产品能力，不属于本计划的零行为变化对照集。

## 结果

| 场景 | 结果 | HTTP（迁移前/迁移后） | 响应字节（迁移前/迁移后） |
| --- | --- | --- | --- |
| `public.article_list` | PASS | 200 / 200 | 7763 / 7763 |
| `public.article_browse` 第 1 页 | PASS | 200 / 200 | 7763 / 7763 |
| `public.article_detail` 已发布文章 | PASS | 200 / 200 | 440 / 440 |
| `public.article_detail` 不可见文章 | PASS | 404 / 404 | 72 / 72 |
| `public.recommendation_current` | PASS | 200 / 200 | 2560 / 2560 |
| `public.article_type_list` | PASS | 200 / 200 | 397 / 397 |
| `public.term_list` | PASS | 200 / 200 | 808 / 808 |
| `public.mobile_article_shelf` | PASS | 200 / 200 | 4172 / 4172 |
| `admin.article_list` | PASS | 200 / 200 | 7725 / 7725 |
| `admin.article_detail` | PASS | 200 / 200 | 524 / 524 |
| `admin.article_type_list` | PASS | 200 / 200 | 397 / 397 |
| `admin.term_list` | PASS | 200 / 200 | 808 / 808 |

共 12 个既有读取场景通过，未发现状态码、envelope、字段或排序差异。写操作没有用于对照，避免对测试数据引入顺序相关的状态变化；其协议行为由 Product、Mock 和 Product 到 Data 链路测试覆盖。

## 复核方式

旧版与新版分别启动在独立端口后，对每个路径执行以下等价比较：

```js
const [beforeResponse, afterResponse] = await Promise.all([
  fetch(`http://127.0.0.1:18086${path}`),
  fetch(`http://127.0.0.1:18084${path}`),
]);
const [beforeText, afterText] = await Promise.all([
  beforeResponse.text(),
  afterResponse.text(),
]);
assert.equal(beforeResponse.status, afterResponse.status);
assert.equal(beforeText, afterText);
```
