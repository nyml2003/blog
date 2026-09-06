---
kind: workstream
id: WORKSTREAM-EDITOR
status: archived
outcome: not_implemented
archived: 2026-09-07
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
role: frontend-desktop
owner: frontend-desktop
depends_on:
  - WORKSTREAM-BACKEND-WRITE
  - PLAN-DESKTOP-EDITOR-001:archived
  - SPEC-ADMIN-AUTH-001:implemented
  - PLAN-MOBILE-BROWSE-IA-001:client-write-set-handoff
write_set:
  - src/frontend/desktop/src/pages/admin/
  - src/frontend/desktop/src/app.tsx
  - src/frontend/desktop/src/styles.css
  - src/frontend/desktop/pages/admin-home/index.html
  - src/frontend/common/client/
last_reviewed: 2026-09-07
---

# 工作流：后台编辑器与工作台

## 目标与前置

后台承担所有文章、类型、专题、标签和下架操作；工作台是唯一整批提交和手动同步入口。必须先完成后端接口、编辑器计划归档、独立登录交付和公共客户端写集交接，才能改造。

保留 CodeMirror、源码诊断定位与分屏安全预览；Desktop 与 Mobile 不互相导入 UI，公共客户端只承载契约与无界面逻辑。

## 实施

1. 编辑器保存调用临时工作区接口，保存成功只表示服务器暂存。非法内容禁止保存，显示诊断并保留输入和上次保存状态；接口错误不能清空表单。
2. 后台文章列表和编辑页读取同一工作区，支持未提交新文章和从 PR 恢复的文章；taxonomy 页面改为暂存操作，下架先进入批次。
3. 以现有 admin-home 为工作台，集中显示完整待提交清单、当前 PR 链接与状态、PR 提交之后的新变化、最近一次同步结果。
4. 工作台统一提供整批提交、打开 GitHub PR、手动同步和经确认的放弃批次。没有逐项勾选、单篇提 PR或旧“保存并发布”入口。
5. 提交包含全部已保存变化；未保存的浏览器输入不伪装成已提交。忙碌、失败、版本冲突、远程状态未恢复、已合并待同步和空批次有明确状态。
6. 同一分支后续提交更新原 PR；合并后同步成功才结束旧批次，新保存的临时变化仍显示在下一批。普通同步不丢稿。
7. 放弃需明确确认；服务器确认完成前不清空客户端状态，关闭 PR 失败保留原内容。
8. 公共客户端、browserClient 组合根与现有资源适配同步更新管理 DTO 和调用；保持公开方法与 Mobile 消费契约。
9. 更新既有编辑器指南的保存/提交/合并/同步说明，移除旧直接发布语义；不增加图片入口，不扩大 HTML Profile。
10. 401、服务端 HTML 诊断、工作区冲突与 GitHub 配置失败沿用明确错误边界，凭证不进入客户端。

## 验证

- 按项目 TS 工作流先读取规则/配置、运行基线检查，再修改；记录精确错误，不擅自更新依赖锁或全局环境。
- 客户端测试覆盖保存/批次/同步/放弃 DTO 及错误归一化，旧公共 API 测试保持通过。
- Spec 003/008/009/011/015/016/018：真实浏览器检查新建、多文章批次、新 taxonomy、下架、错误保存、PR 更新、合并后同步、确认放弃和 401。
- typecheck、lint、format check、核心测试、build 全部完成；Desktop/Mobile 公开页面回归另留浏览器证据。

## 当前阻塞与记录

2026-09-06：编辑器计划尚未归档，独立鉴权未交付，后端接口未实现；公共客户端有 Mobile 在途变更。本工作流不得提前改造或用 Mock 页面截图代替完整验收。
