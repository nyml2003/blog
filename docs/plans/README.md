# 计划

Plan 面向一个跨职能、可验收的产品结果，不面向单个文件或单个技术动作。

## 目录

- `active/`：当前执行中的业务计划；
- `archive/`：已完成或按用户要求结束的计划及结果、证据；未完成项以归档结果为准；
- `_template/`：新计划模板。

当前 active business plan：

- `PLAN-ADMIN-AUTH-001`：管理端 Session + TOTP 鉴权与登录闭环（实现、进程测试和浏览器证据完成，待用户完成秘密保管与产品验收）；
- `PLAN-ARCH-BOUNDARY-001`：架构边界治理（代码与自动化完成，含 [API 响应对照](./active/PLAN-ARCH-BOUNDARY-001/API-RESPONSE-DIFF.md)，待用户产品验收）；
- `PLAN-FRONTEND-PAGE-TEMPLATE-001`：前端页面模板与接入统一（代码与自动化完成，含 [浏览器证据](./active/PLAN-FRONTEND-PAGE-TEMPLATE-001/evidence/README.md)，待用户产品验收）；
- `PLAN-CONTENT-TAXONOMY-001`：内容分类树与大模型 PR 工作流（实现、真实 GitHub PR/sync 和浏览器证据完成，当前 PR #2 保持 open，待用户验收）；

## 发布就绪锚点（v1）

用户决策（2026-09-07）：先建好架构、打磨好产品再发布；v1 纯文字，图片 / RSS / SEO 均不进门槛。发布门槛 = 下列全部完成，届时公网部署计划为临门一脚。

- [x] `PLAN-DESKTOP-EDITOR-001` 归档；
- [x] `PLAN-MOBILE-BROWSE-IA-001` 归档；
- [x] Mobile 分类货架与平铺页语义接续（原子迁移 R4 的旧三级语义已由 `PLAN-CONTENT-TAXONOMY-001` 的一级/二级分类树和页面计划取代）；
- [ ] Mobile legacy CSS 下线（原子迁移 R5，尚未立项，不属于当前 active plan）；
- [ ] 内容生产闭环验收（`PLAN-CONTENT-TAXONOMY-001` 已补齐原 partial 计划的生产 GitHub、快照、工作区与真实 PR/sync，待用户审查当前 PR 和最终行为）；
- [ ] `SPEC-ADMIN-AUTH-001` 验收（实现、门禁和浏览器登录闭环已完成，待用户确认实际秘密保管与产品行为）；
- [x] Desktop T 型浏览完成（由 `PLAN-FRONTEND-PAGE-TEMPLATE-001` 交付）；
- [ ] 公开端分页（尚未立项，不属于当前 active plan）；
- [ ] `PLAN-ARCH-BOUNDARY-001` 用户验收（R0-R3、门禁和行为对照均已完成）；
- [ ] 公网部署计划（TLS / unit 生产化 / 备份演练；门槛达成后立项）。

明确不在 v1（v1.1+）：图片资产链路、RSS、SEO、阅读体验增强（TOC / 代码高亮跟主题）、评论、PWA。

最近归档：

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
