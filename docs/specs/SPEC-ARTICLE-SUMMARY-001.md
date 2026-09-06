---
kind: spec
id: SPEC-ARTICLE-SUMMARY-001
status: accepted
owner: product
plan_id: PLAN-MOBILE-DENSITY-001
last_reviewed: 2026-09-05
---

# 文章摘要契约

## 目标

为文章提供可选、可维护的列表摘要，服务端和 B Desktop 共享同一输入边界，公开端只读展示。

## 非目标

- 不从正文自动推导摘要；
- 不改变正文 HTML 片段契约；
- 不改变草稿/发布状态流转或 PC 公共页面布局。

## 场景

### SPEC-ARTICLE-SUMMARY-001

Given 管理端新建或编辑文章
When 摘要为空或不超过 160 个 Unicode 字符
Then 保存和发布成功，响应及后续读取返回摘要字符串，空值为 `""`

### SPEC-ARTICLE-SUMMARY-002

Given 摘要首尾存在空白或超过 160 个 Unicode 字符
When 管理端提交保存
Then 服务端先去除首尾空白；超限返回 `422/INVALID_SUMMARY`，文章数据不发生变化

### SPEC-ARTICLE-SUMMARY-003

Given 已存在未迁移的数据库
When 应用版本 2 迁移
Then `articles.summary` 存在且旧文章摘要为空，重复启动不会重复迁移

## 边界与失败

- 列表、推荐、详情和 Admin 文章响应均包含 `summary`；列表仍不包含正文 HTML；
- 长度按去除首尾空白后的 Unicode 字符计数，不按 UTF-8 字节计数；
- B 表单保留用户输入并显示服务端错误。

## 测试/验收证据

- 自动化测试：迁移、领域服务和 HTTP 响应测试；
- 人工验收：B Desktop 新建、编辑、预览、发布和重新打开回显。
