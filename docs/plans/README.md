# 计划

Plan 面向一个跨职能、可验收的产品结果，不面向单个文件或单个技术动作。

## 目录

- `active/`：当前执行中的业务计划；
- `archive/`：已完成或按用户要求结束的计划及结果、证据；未完成项以归档结果为准；
- `_template/`：新计划模板。

当前没有 active business plan（2026-09-10 用户指示批量归档验收中的五个计划，见"最近归档"；新计划按 `_template/` 创建并在此登记）。

## 发布就绪锚点（v1）

用户决策（2026-09-07）：先建好架构、打磨好产品再发布；v1 纯文字，图片 / RSS / SEO 均不进门槛。发布门槛 = 下列全部完成，届时公网部署计划为临门一脚。

- [x] `PLAN-DESKTOP-EDITOR-001` 归档；
- [x] `PLAN-MOBILE-BROWSE-IA-001` 归档；
- [x] Mobile 分类货架与平铺页语义接续（原子迁移 R4 的旧三级语义已由 `PLAN-CONTENT-TAXONOMY-001` 的一级/二级分类树和页面计划取代）；
- [ ] Mobile legacy CSS 下线（原子迁移 R5，尚未立项，不属于当前 active plan）；
- [ ] 内容生产闭环验收（计划已归档，**PR #2 仍 open**——合入或关闭由用户决定，处置前此锚点不勾）；
- [x] `SPEC-ADMIN-AUTH-001` 验收（2026-09-10 随计划归档；秘密保管与走查由用户自行完成）；
- [x] Desktop T 型浏览完成（由 `PLAN-FRONTEND-PAGE-TEMPLATE-001` 交付）；
- [ ] 公开端分页（尚未立项，不属于当前 active plan）；
- [x] `PLAN-ARCH-BOUNDARY-001` 用户验收（2026-09-10 随批量归档指示确认）；
- [ ] 公网部署计划（TLS / unit 生产化 / 备份演练；门槛达成后立项）。

明确不在 v1（v1.1+）：图片资产链路、RSS、SEO、阅读体验增强（TOC / 代码高亮跟主题）、评论、PWA。

最近归档：

- [PLAN-CODE-LAYOUT-001](./archive/PLAN-CODE-LAYOUT-001/PLAN.md)：代码布局与命名治理（壳层/查询/客户端按领域与文件形态拆分、ops 歧义名清理），见 [RESULT](./archive/PLAN-CODE-LAYOUT-001/RESULT.md)；
- [PLAN-ADMIN-AUTH-001](./archive/PLAN-ADMIN-AUTH-001/PLAN.md)：管理端 Session + TOTP 鉴权与登录闭环，见 [RESULT](./archive/PLAN-ADMIN-AUTH-001/RESULT.md)；
- [PLAN-ARCH-BOUNDARY-001](./archive/PLAN-ARCH-BOUNDARY-001/PLAN.md)：架构边界治理（查询层/BFF 拆分/门禁规则），见 [RESULT](./archive/PLAN-ARCH-BOUNDARY-001/RESULT.md)；
- [PLAN-CONTENT-TAXONOMY-001](./archive/PLAN-CONTENT-TAXONOMY-001/PLAN.md)：内容分类树与大模型 PR 工作流（PR #2 仍 open，见 RESULT 遗留节）；
- [PLAN-FRONTEND-PAGE-TEMPLATE-001](./archive/PLAN-FRONTEND-PAGE-TEMPLATE-001/PLAN.md)：前端页面模板与接入统一（注册表单一事实源 + 货架归一）；
- [PLAN-DESKTOP-UI-001](./archive/PLAN-DESKTOP-UI-001/PLAN.md)：依据 Desktop 高频范式建立隔离的基础组件库；首批四个组件完成内部契约、边界和构建测试，页面接入另立计划，见 [RESULT](./archive/PLAN-DESKTOP-UI-001/RESULT.md)；

- [PLAN-MOBILE-BROWSE-IA-001](./archive/PLAN-MOBILE-BROWSE-IA-001/PLAN.md)：C Mobile 浏览信息架构（货架快照 + F 型平铺页 + `public.article_browse` 新接口）；用户验收通过，见 [RESULT](./archive/PLAN-MOBILE-BROWSE-IA-001/RESULT.md)；

- [PLAN-CONTENT-GITHUB-TRUTH-001](./archive/PLAN-CONTENT-GITHUB-TRUTH-001/PLAN.md)：内容真源 GitHub 化；按用户要求以部分交付状态归档，完整流程未验收，见 [RESULT](./archive/PLAN-CONTENT-GITHUB-TRUTH-001/RESULT.md)；

- [PLAN-MOBILE-ATOM-EXPANSION-001](./archive/PLAN-MOBILE-ATOM-EXPANSION-001/PLAN.md)：C Mobile 原子/分子与当前页面迁移；R4/R5 后续另立计划；

- [PLAN-DESKTOP-EDITOR-001](./archive/PLAN-DESKTOP-EDITOR-001/PLAN.md)：B Desktop 文章编辑器升级（CodeMirror + 分屏实时预览 + 已保存版本端到端预览）；

- [PLAN-MOBILE-THEME-SETTINGS-001](./archive/PLAN-MOBILE-THEME-SETTINGS-001/PLAN.md)：C Mobile 设置页、数据分层与 mobile-ui 容器及组合组件；归档结果中的 Product 路由 follow-up 已由 `PLAN-FRONTEND-PAGE-TEMPLATE-001` 关闭；

- [PLAN-OPS-RUNTIME-DEV-001](./archive/PLAN-OPS-RUNTIME-DEV-001/PLAN.md)：Ops Runtime 开发模式；
- [PLAN-MOBILE-CSS-ARCHITECTURE-001](./archive/PLAN-MOBILE-CSS-ARCHITECTURE-001/PLAN.md)：C Mobile CSS 正交化；
- [PLAN-OPS-PARAMETERS-001](./archive/PLAN-OPS-PARAMETERS-001/PLAN.md)：Ops 字段参数模型与显式输入；
- [PLAN-CLIENT-ARTICLE-LIST-001](./archive/PLAN-CLIENT-ARTICLE-LIST-001/PLAN.md)：文章列表契约修复（Desktop“文章加载失败”）；
- `PLAN-ARTICLE-HTML-VALIDATION-001`：手写 Rust HTML Profile、native/WASM 共享校验、后端权威门禁与 B Desktop 诊断；
- `PLAN-CLIENT-SDK-001`：客户端 SDK 与 Solid Resource 适配；
- `PLAN-MOBILE-DENSITY-001`：C Mobile 信息密度优化；
- `PLAN-MOBILE-DENSITY-002`：C Mobile 信息密度优化第二轮；

第一条业务计划已按用户指定创建，后续计划沿用同一模板并由项目经理负责协调。

## 状态

```text
准备 -> 进行中 -> 阻塞 -> 验收 -> 完成 -> 归档
```

每个计划有一名项目经理，并可以包含产品、视觉、前端、BFF、后端、基建和运维等 workstream。任务声明 `write_set`，重叠写集不得并行执行。
