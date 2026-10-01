---
kind: plan-inventory
plan: PLAN-FRONTEND-BOUNDARY-NORMALIZATION-001
status: completed
last_reviewed: 2026-10-01
---

# 防御式代码盘点

这份记录用于决策闸门和收尾验收的事实盘点。每项都记录当前归属、分类和证据；本轮不修改共享包协议。

## 盘点口径

- Mobile：覆盖 `src/frontend/app/habitat/mobile`、`src/frontend/app/bootstrap/mobile`、对应 API 适配层和测试。
- Desktop：覆盖公开页、admin、bootstrap、API 和编辑器/Taxonomy 存储入口。
- 共享包：只记录 `packages/port`、`packages/web` 的消费者和协议影响，是否改动另行决策。
- 每条记录必须包含：外部入口、当前归一化位置、业务消费位置、分类 A/B/C/D、行为保持证据、关联测试。

## 已定位入口

| 入口或问题 | 当前位置 | 初步判断 | 待补证据 |
| --- | --- | --- | --- |
| Mobile API 响应中的 `null` 和可选字段 | `src/frontend/app/habitat/api/mobile/types.ts` | 已有部分 `null -> undefined` 转换；需区分协议镜像与领域语义 | 逐字段列出 wire 类型、领域类型和页面消费者 |
| 分类树与 `selectedCategoryId` | `src/frontend/app/habitat/api/mobile/types.ts`、`src/frontend/app/habitat/mobile/logic/category.ts` | 需确认树结构不变量的认证归属；不能直接删除回退分支 | 后端/fixture 不变量、异常输入测试、C/D 分类 |
| Mobile 设置存储 | `packages/web/src/persistence.ts`、`src/frontend/app/habitat/mobile/logic/settings.ts` | 传输和语义解析职责目前跨层 | JSON.parse、默认值、错误转换的逐步调用图 |
| 存储缺失与错误 | `packages/port/src/ports/persistence.ts` | 共享协议议题，不默认修改 | 全部消费者清单及兼容性影响 |
| URL 参数 | Mobile/Desktop 页面、logic、bootstrap 多处 `URLSearchParams` | 存在重复解析候选 | 参数名、有效值规则、统一归属建议 |
| 日期显示解析 | Mobile/Desktop detail、admin-preview 页面 | 存在重复的非法日期防御候选 | 输入来源、展示约定、测试覆盖 |

## 本轮已处理

| 入口 | 处理结果 | 证据 |
| --- | --- | --- |
| Mobile 设置 snapshot、legacy keys | 解析、校验、默认值和迁移集中到 `src/frontend/app/habitat/mobile/settings-storage.ts`；模型类型和常量集中到 `settings-model.ts` | `src/frontend/tests/app/mobile/settings.test.ts` 保持原有 4 个场景通过 |
| Mobile `category_id` URL 参数 | 解析集中到 `src/frontend/app/habitat/mobile/category-input.ts`；`logic/category.ts` 只保留分类选择和链接生成 | `src/frontend/tests/app/mobile/category.test.ts` 的输入、回退和链接场景通过 |
| Mobile/Desktop `id`、Desktop `type_id` URL 参数 | 解析集中到 `src/frontend/app/habitat/route-input.ts`，bootstrap 的文章详情复用同一函数 | Mobile/Desktop 页面和 bootstrap 不再各自实现数字校验；前端测试通过 |
| Mobile/Desktop detail 日期显示 | `displayDate` 集中到 `src/frontend/app/habitat/route-input.ts` | 无效日期仍显示 `-`；共享输入测试覆盖 |
| Desktop taxonomy 文本 | 解析集中到 `src/frontend/app/habitat/desktop/taxonomy-input.ts`，logic 只协调状态和 API | taxonomy 页面行为测试和全量前端测试通过 |
| Desktop editor session storage | JSON 解析和 storage 读写集中到 `src/frontend/app/habitat/desktop/editor-session-storage.ts` | session draft 测试通过；logic 文件仅保留兼容 re-export |
| 分类树不变量 | `categorySelection` 的回退保留在领域逻辑 | D 类：API 目前未认证 rooted forest；代码注释和分类测试锚定保留理由 |

本轮没有改动 API wire schema、共享包协议或分类树回退行为。

## 统计记录

最终计数必须在盘点时现场执行并把命令和结果提交到本文件。当前 Plan 中的 `22 / 15 / 8 / 1` 仅是未复核的历史估计，不作为基线。

建议至少记录以下检索结果，并人工排除测试、纯领域校验和正当错误处理：

```text
rg -n "URLSearchParams|JSON\.parse|Number\.isNaN|\.nullish\(|\?\?|if \(!.*ok\)" src/frontend/app packages
```

2026-10-01 全量复扫结果：命中 228 行。该命令用于发现候选位置，不能直接作为“防御写法数量”；URL 输入、JSON 解析和日期解析已逐处人工分类，剩余命中主要是输出拼接、API schema 归一化、合法业务 optional 和 D 类错误处理。

## 盘点完成条件

- Mobile 和 Desktop 全量入口逐项有记录。
- A/B/C/D 每项都有理由，C 类有边界认证证据。
- 共享包协议是否进入本轮已有明确结论。
- 防御计数有可重复命令、排除规则和结果。
- 形成试点域建议后，才进入 PLAN.md 的决策闸门。

当前状态：全量代码门禁、构建、集成 E2E 和 Mobile 性能采样均已通过，收尾记录见 RESULT.md。
