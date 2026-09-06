---
kind: plan
id: PLAN-ARTICLE-HTML-VALIDATION-001
status: in_progress
owner: project-manager
created: 2026-09-05
last_reviewed: 2026-09-05
coordinates_with: [PLAN-CLIENT-SDK-001, PLAN-MOBILE-CSS-ARCHITECTURE-001]
external_dependencies: [PLAN-OPS-RUNTIME-DEV-001]
---

# 文章 HTML 校验

## 目标

为文章正文建立受版本控制的 HTML Fragment Profile，并让 Rust Product 服务成为唯一权威校验者。当前阶段接入共享 Rust core 的 WASM 预检，改善 B Desktop 作者体验；前端预检不构成安全边界。作者仍以源码方式编写 HTML 片段，系统主题仍由 Desktop 和 Mobile 各自的 `ArticleBody` 包裹；不符合正文契约的内容应获得定位明确、可行动的诊断，且不能在公共阅读页形成脚本、事件处理器、自定义样式或不受支持结构的执行入口。

本计划校验“可存储、可预览、可发布的系统正文 HTML”，不把文章编辑器改成 Markdown 或富文本编辑器。

## 成功标准

- 建立 `SPEC-ARTICLE-HTML-VALIDATION-001`，其中包含 HTML Profile 的版本、允许元素、属性、URL scheme、正文 class 策略、禁止结构及每项诊断语义；
- 校验使用共享 Rust core 的手写受控 HTML Fragment Parser 产生的结构树，禁止以正则表达式、字符串黑名单或第三方 HTML parser 的容错结果充当安全边界；
- Rust 服务端在创建、更新、发布三个状态转换点执行同一份权威规则，不能由 B 端绕过；在该后端完成前，前端 WASM 只能作为预检，不能宣称公开路径已安全；
- 校验器只报告结果，不会静默删除、重排、转义或重新序列化作者已提交的正文；原始合法 HTML 片段按现有模型保存；
- 诊断至少包含稳定 code、严重度、可读消息、定位信息和关联的 Profile version，供 B 端和未来客户端 SDK 使用；
- B Desktop 编辑器能在保存/发布失败时保留原输入并展示可定位的诊断；预览入口不得把未经处理的危险 HTML 当作可信正文直接执行；
- 已有文章经过审计：有效内容保持可读；无效历史内容有可复现清单、修复建议和明确的发布/回滚策略；
- Desktop 和 Mobile 都继续只渲染通过 Profile 的系统正文，文章作者不能注入自定义 CSS、脚本、事件属性或未批准的嵌入内容；
- 单元、HTTP 契约、B 端反馈和真实公共渲染路径均有验收证据。

## 已确认的边界

- 正文是 HTML 片段，不是完整 HTML 文档；系统负责页面外壳与主题；
- 作者不能新增 CSS。系统主题依赖已批准的语义元素；正文不得携带 `class` 或 `style` 属性；
- 本计划以校验和显式拒绝为主，不把“自动 sanitization”伪装成校验；任何未来的自动修复/迁移须单独说明输入、输出与原文保留策略；
- 服务端是可信边界。浏览器中的预检只能改善作者体验，不能取代服务端校验；
- 规则对 C Desktop、C Mobile 与 B Desktop 的正文语义相同；端内的 CSS 和 UI 实现仍保持隔离；
- 正文允许集合必须从现有 `.article-body` 的系统主题能力和真实写作需要推导，不能为了“通用 HTML”开放脚本、表单、嵌入、内联样式或任意 class。

## 已确认的产品决策

以下策略已由产品负责人确认并写入 Spec：

1. 生效门槛（已确认）：无效正文允许保存为草稿并返回可定位诊断，但发布必须阻断；预览不得把未通过校验的正文直接注入渲染。
2. 外部资源（已确认）：禁止图片；链接只允许 Spec 定义的绝对 `http`/`https` URL，且作者必须显式写出 `target="_blank"` 与 `rel="noopener noreferrer"`。
3. 系统 class（已确认）：正文完全禁止 `class`。
4. 历史正文（已确认）：当前内容均为测试数据，Profile 上线前删除并按合法 fixture 重建，不做自动迁移或自动修复。

这些决策允许进入 Rust core、WASM、Product 和 B Desktop 实现；WASM 预检仍不能替代 Rust Product 的权威校验。

## 非目标

- 不引入 Markdown、富文本编辑器、文章自定义 CSS 或作者自定义 JavaScript；
- 不实现完整 WYSIWYG、协同编辑、版本历史、自动排版或 AI 内容生成；
- 不将 HTML 校验塞入通用 Data SDK，不让页面直接依赖 URL、HTTP method 或 DTO；
- 不以 CSP、反向代理或 Admin 认证替代正文校验；这些属于独立的部署访问边界；
- 不顺带重做 Desktop/Mobile `ArticleBody` 的视觉主题，也不修改 Mobile CSS 正交化计划的组件边界；
- 不做通用的、无边界的 HTML sanitizer 平台。

## 分层与契约

```text
B Desktop source editor
  -> business Client SDK: draftEditor.inspectHtml/saveDraft/publish
  -> Rust validation core (WASM precheck)
  -> B Desktop diagnostics / preview gate

Rust Product backend
  -> HTTP application boundary
  -> Rust article content validation service (authoritative, coordinated with PLAN-OPS-RUNTIME-DEV-001)
  -> shared Rust HTML Fragment Parser/Profile -> AST + diagnostics
  -> Article service state transition / SQLite
  -> C Desktop / C Mobile ArticleBody (system theme only)
```

- Profile 是共享 Rust core 的领域内容契约；不得放在 HTTP handler、前端组件或 CSS 文件中；
- 诊断是领域结果，不泄漏 parser 节点、Rust 内部错误、SQL 或 HTTP 实现细节；
- 若需要提供“仅检查、未保存正文”的能力，业务前端只能调用 `draftEditor.inspectHtml` 领域能力，不可直接拼接接口或传输字段；WASM 适配器与未来 HTTP 能力必须使用同一诊断 schema，并与 `PLAN-CLIENT-SDK-001` 的 Domain 边界协调；
- 公开读取不依赖浏览器端“再次消毒”作为安全保证。数据库中可公开读取的正文必须已经过服务端 Profile 校验，历史例外需有显式隔离策略；
- Profile 变更必须带 version、fixture 变化和兼容性说明，不能悄悄扩大允许集合。

## 手写 Fragment Parser 范围

Parser 的名字和实现边界必须是 **HTML Fragment Parser**，不是试图复刻浏览器完整容错算法的通用 HTML parser。它只为本产品的受控正文语言服务，并采用“无法明确理解就拒绝”的策略。

- 解析输入为单个正文 fragment，不接受完整文档、`doctype`、注释、处理指令、CDATA 或 raw-text 元素；
- 使用明确的 tokenizer 和栈式树构造器输出 AST：`Element`、`Text`、`Attribute` 与源位置；不能在解析过程中拼接、替换或重序列化原文；
- 标签与属性必须使用受文档化的严格语法：小写名称、成对闭合、属性值带引号、无重复属性；只允许 Profile 明确列出的 void 元素采用明确的空元素规则；
- 文本和属性实体只支持一小组明确列出的命名/数字实体；未知、截断或畸形实体报出诊断，不猜测修复；
- 所有节点、属性和文本都保留原始 source span（至少字节区间与 line/column），使业务诊断可以定位到编辑器内容；
- 解析器独立于具体 allowlist；Profile validator 在 AST 上检查元素、属性、嵌套、URL、class 与内容规则。这样规则变更不会重写 tokenization；
- 设定正文大小、嵌套深度、节点数、属性数和属性/文本长度的上限，超过上限得到稳定资源限制诊断；
- 不引入 HTML parser/sanitizer 依赖。实现可用 Rust 标准库完成字符与 Unicode 辅助处理，但受控语法、tokenizer、AST 和错误恢复策略必须由项目代码维护；
- 不设计错误恢复。任何未闭合标签、错误嵌套、非预期字符或不支持语法都终止为可定位的失败；浏览器可能显示的“修复后页面”不构成正文合法性。

此范围使作者书写的是“严格的系统 HTML fragment”，而非任意浏览器 HTML。Profile 产品 Spec 必须公开这一写作约束，并提供合法示例。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 产品/内容设计：HTML Profile 与生效策略 | product + content-design | - | `docs/specs/SPEC-ARTICLE-HTML-VALIDATION-001.md`, 本计划 | completed |
| Rust core：手写 Fragment Parser、Profile validator 与共享诊断 schema | backend | 产品 Profile、正式 Rust workspace | `Cargo.toml`, `crates/article-html-core/`, `crates/article-html-wasm/` | blocked |
| 前端 WASM：预检适配与加载边界 | frontend-core | 产品 Spec、Rust core schema、PLAN-CLIENT-SDK-001 | `web/common/client/`, `web/common/validation/`, WASM 接入配置 | ready |
| 后端：Rust 权威校验与保存/发布边界 | backend | 产品 Spec、Rust core、PLAN-OPS-RUNTIME-DEV-001 Product/Data 边界 | Rust Product application/domain crate | blocked |
| B Desktop：诊断与安全预览体验 | frontend-admin | 产品 Spec、WASM 领域结果、Client SDK Domain 契约 | `web/desktop/src/pages/admin/`, `web/desktop/src/app.tsx` | ready |
| 存量审计：历史正文、迁移/回滚方案 | backend + operations | 确认后的 Profile | `docs/plans/active/PLAN-ARTICLE-HTML-VALIDATION-001/`, 只读数据库审计脚本 | completed |
| 测试：Profile fixtures、WASM、B Desktop 与端到端渲染验收 | frontend-core + frontend-admin | Rust core、WASM、B Desktop；Rust backend HTTP 结果后补 | `web/common/**/*.test.ts`, `web/desktop/**/*.test.*`, `internal/**/*_test.go`, 验收记录 | in_progress |
| 项目管理：决策门、写集协调与集成验收 | project-manager | 全部工作流 | 计划、Spec、结果、状态记录 | ready |

项目经理启动提示见同目录的 `PM-PROMPT.md`。

## 执行顺序

```text
现状正文审计 + 候选 HTML Profile
  -> 用户确认剩余三项内容策略
  -> Rust core 诊断 schema 与 WASM 适配契约
  -> B Desktop WASM 预检与安全预览限制
  -> Rust Product 权威校验与诊断契约
  -> B Desktop 保存/发布/预览反馈
  -> 存量处理与回归验收
```

`PLAN-CLIENT-SDK-001` 与本计划可以并行完成通用 Core 工作，但一旦本计划需要新增 `draftEditor` 领域能力，必须由两个计划的项目经理确认接口所有权和交付顺序。`PLAN-MOBILE-CSS-ARCHITECTURE-001` 不等待本计划，但其 `.article-body` 允许的语义元素必须被内容 Profile 引用和验证。

## 集成验收

1. 使用包含合法嵌套、纯文本、实体、自闭合语法、错误嵌套、未闭合标签、重复属性、未引用属性、畸形实体、超限输入、空正文、脚本、事件属性、`style`、危险 URL、`class`、图片和不支持嵌入的 fixture 覆盖 Parser 与 Profile。
2. Rust 后端接入后，通过 API 创建、更新和发布无效正文均返回稳定领域诊断；在接入前不得把 WASM 预检当作服务端安全验收。
3. 按确认后的策略验证草稿与发布的不同结果，且失败后标题、摘要、分类、标签和 HTML 输入都不会丢失。
4. B Desktop 的保存、发布和预览路径展示相同语义的诊断；没有 JavaScript 执行、事件处理器触发或自定义样式注入。
5. C Desktop 与 C Mobile 在同一合法 fixture 集上正常渲染标题、段落、列表、代码、引用、表格和链接，不出现横向溢出或主题退化；图片 fixture 必须拒绝。
6. 对历史文章运行审计，输出可重复的 ID/规则/version 报告；按确认策略验证迁移、隔离或存量展示结果。
7. Profile 更新需要 Spec、fixture 和兼容性说明同步变化；前端质量检查和浏览器验收均通过，Rust 后端接入后再补齐服务端与 HTTP 验收。

## 未决项

- Fragment Parser 与 Profile validator 采用共享 Rust core 手写实现；v1 严格语法不包含 void 元素，所有允许元素显式闭合；
- `PLAN-OPS-RUNTIME-DEV-001` 当前拥有根 Cargo workspace 和 `crates/` 写集；其 workspace 与 Product/domain 边界建立后，按 `INTEGRATION-CONTRACT.md` 接入 core、WASM 和权威校验；
- 外部资源策略、系统 class 策略和存量策略已写入 `SPEC-ARTICLE-HTML-VALIDATION-001.md` v1：禁用图片、链接强制 `http/https` + `target`/`rel`、禁止正文 `class`，测试数据删除后重建；
- 是否增加独立“检查未保存正文”领域能力，由 B Desktop 的预览体验调研后确定；
- Content Security Policy 可作为纵深防御在部署计划中评估，但不属于本计划的替代验收。
