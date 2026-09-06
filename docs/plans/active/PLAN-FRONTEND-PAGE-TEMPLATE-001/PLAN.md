---
kind: plan
id: PLAN-FRONTEND-PAGE-TEMPLATE-001
status: in_progress
owner: project-manager
created: 2026-09-07
last_reviewed: 2026-09-07
---

# 前端页面模板与接入统一（注册表驱动）

## 目标

按 [SPEC-FRONTEND-PAGE-TEMPLATE-001](../../../specs/SPEC-FRONTEND-PAGE-TEMPLATE-001.md) 建立页面注册表单一事实源：构建期生成 `index.html`、派生 vite 注册、统一 head 元数据规范与首绘 bootstrap 注入、`definePage` 统一页面接入、CSS 入口契约收敛。消除页面工程的三处声明、样板复制与 head 乱象。同时按用户追加决定完成公开端货架形态归一：Mobile 文章 list 页及其二级页保持 F 型，其余公开货架统一为 T 型。

## 决策记录（用户已定）

1. 统一档位 = **注册表驱动生成**（手写 HTML 退场，vite input/alias 从注册表派生）；
2. title 规范：公开端 `{页面名} - 技术知识库`、管理端 `{页面名} - 管理台`，英文占位符全清；
3. 细节默认：`definePage(App)` mount helper；mobile CSS 收敛单一入口（顺序契约不变）；`mobile-settings-bootstrap` 泛化为通用 `page-bootstrap`（注册表声明注入 + 子构建缓存）；theme-color 静态纸张色（动态留 v1.1）。
4. 注册表补齐 Product 的 Mobile 设置页路由，使 `/m/settings/index.html` 在 integration 模式可访问；
5. 页面 title 使用计划约定的中文页面名，由执行 agent 定稿；用户负责最终产品验收。
6. 货架形态：Mobile `/m/articles/index.html` 与二级 `/m/articles/list.html` 使用 F 型；其余公开端货架使用 T 型；管理端文章表格是操作界面，不按展示货架改造。
7. T 型货架首个请求同时返回筛选项与第一个筛选项对应的文章数据；切换筛选项后重新请求文章数据并重新渲染。切换期间旧请求必须取消或忽略，且页面覆盖加载、空态、失败和重试状态。

## 成功标准

Spec 全场景通过，核心：新增页面只改注册表一行；全部 HTML 生成且 head 统一规范；`getElementById("app")` 样板零残留；bootstrap 单次构建；T/F 货架分工、按筛选重取数据与竞态处理符合契约；非货架页面功能 / 视觉 / 首绘零回归；四命令全绿。

## 非目标

见 Spec 非目标节（不做 SEO 套件、不引路由框架、不动 Mobile 原子组件契约、不混入 ARCH-BOUNDARY 的内部边界治理）。

## 约束与依据

- Spec：`SPEC-FRONTEND-PAGE-TEMPLATE-001`（本计划交付并验收）；
- 现状实锤（2026-09-07 核得）：title 占位符两代风格并存（Blog Mobile / Admin / New Article vs 文章检索 - 技术知识库）；HTML 单行与格式化两代并存；`render(() => <App />, getElementById("app")!)` 全库样板；mobile 每页 10 行 CSS import 逐页复制；页面信息在 vite.config 与 index.html 三处重复；`build/mobile-settings-bootstrap.ts` 每页重复子构建无缓存且命名绑死 settings；
- 衔接：`SPEC-ARCH-BOUNDARY-001` 组合根白名单（`definePage` 为规范落点，本计划立机制不迁逻辑）；
- 写集协调：mobile 页面在 BROWSE / 原子 R4-R5 写集、desktop admin 在 EDITOR / CONTENT-TRUTH 写集、`vite.config.ts` 多计划争抢——迁移轮次串行，机制开发先行。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 注册表与生成机制 | frontend | - | 见 [WORKSTREAM-REGISTRY.md](./WORKSTREAM-REGISTRY.md) | in_progress |
| 页面迁移 | frontend | 机制就绪；各端写集交接 | 见 [WORKSTREAM-MIGRATION.md](./WORKSTREAM-MIGRATION.md) | ready |
| 公开端 T/F 货架归一 | frontend + backend | ARCH 后端 BFF/API 就绪；注册表迁移写集交接 | 见 [WORKSTREAM-T-SHELF.md](./WORKSTREAM-T-SHELF.md) | in_progress |

项目经理启动提示见同目录的 [PM-PROMPT.md](./PM-PROMPT.md)。

## 轮次与验收

| 轮 | 内容 | 验收 |
| --- | --- | --- |
| R1 | 注册表 + HTML 生成插件 + vite 派生 + `definePage` + CSS 单入口 + `page-bootstrap` 泛化缓存 | 机制自测；以 settings 页首迁作样板（一页全链路绿） |
| R2 | mobile 页面迁移（按写集交接批次） | 每批：产物 alias 对照 + 功能冒烟 |
| R3 | desktop 页面迁移（公开端先行，admin 等 EDITOR / CONTENT-TRUTH 交接） | 同上 + title 规范走查 |
| R4 | 公开端 T/F 货架归一；T 型首屏与切换筛选请求；竞态与失败状态 | API 契约测试 + 查询层测试 + Desktop/Mobile 浏览器自动化；Mobile 两个 F 型入口无回归 |
| 收尾 | 手写 HTML 全删 + 静态检查（样板零残留）+ Spec accepted | 全量四命令绿 |

## 集成验收

- 自动化：注册表→产物断言、alias 对照、bootstrap 单次构建、样板零残留静态检查、四命令全绿；
- 人工：抽样 head / title 走查、首绘防闪屏回归（mobile 全页）、各页功能冒烟；
- Spec 证据回填。

## 未决项

- R2/R3 批次划分随在途计划归档时点定，PM 排程报备即可；
- 注册表文件形态（单文件 vs 按平台分文件）由机制工作流定并记录。
