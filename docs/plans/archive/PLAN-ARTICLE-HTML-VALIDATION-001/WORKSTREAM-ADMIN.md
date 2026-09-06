---
kind: workstream
id: WORKSTREAM-ARTICLE-HTML-VALIDATION-ADMIN
status: completed
plan_id: PLAN-ARTICLE-HTML-VALIDATION-001
role: frontend-admin
owner: frontend-admin
depends_on: [WORKSTREAM-ARTICLE-HTML-VALIDATION-PRODUCT, WORKSTREAM-ARTICLE-HTML-VALIDATION-PARSER]
write_set: [web/desktop/src/pages/admin/, web/desktop/src/]
last_reviewed: 2026-09-06
---

# B Desktop HTML 诊断与预览

## 目标

在保持源码编辑器的前提下，先通过 WASM 预检向作者清楚显示共享诊断，并为未来服务端权威诊断保留同一领域契约；保存、发布、预览三条路径不能吞掉输入或绕过内容安全边界。

## 输入

- 已确认的 Profile、诊断词典和草稿/发布策略；
- Rust core/WASM 领域结果及经 Client SDK 协调的能力；未来后端 HTTP 领域结果；
- 当前编辑器、session preview 与 `ArticleBody` 实现。

## 输出

- HTML 字段关联的可访问诊断反馈；
- 保存、发布失败时保留输入的行为；
- 安全且与服务端契约一致的预览策略；
- B Desktop 交互和浏览器验收记录。

## 实施任务

1. 映射稳定诊断 code 到作者可理解的字段级/正文级提示。
2. 校验加载、重复点击、网络错误和校验错误的状态优先级。
3. 按确认策略处理未保存预览，不能将 sessionStorage 中的原始危险 HTML 当作可信页面内容直接注入。
4. 通过业务 Client SDK 使用领域能力，不在页面中出现 URL、HTTP method 或 DTO 分支。

## 测试/验收

- 错误可见、可访问，且输入不丢失；
- 有效的 HTML 正常保存、预览、发布；当前发布安全性仍需未来 Rust 后端完成权威接入后验收；
- 无效 HTML 在确认的门槛上得到一致处理；
- 预览不执行脚本、事件属性或自定义 CSS。

## 阻塞

- 无当前阻塞，Client capability、WASM 及权威服务端结果已接入。

## 交付记录

- 2026-09-06：编辑器显示可定位诊断，错误和保存期间保留输入；WASM 失败可保存草稿、禁止预览/发布。预览页重新检查缓存，当前 source 绑定防止过期结果放行。Chromium 验证完成；见 `RESULT.md`。
