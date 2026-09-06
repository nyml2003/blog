---
kind: workstream
id: WORKSTREAM-EDITOR
status: ready
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
role: frontend-desktop
owner: frontend-desktop
depends_on:
  - WORKSTREAM-BACKEND-WRITE
last_reviewed: 2026-09-06
---

# 工作流：编辑器与管理台改造（保存 = 分支，发布 = PR）

## 目标

实现 Spec 场景 003 的编辑器侧：保存改为写 feature 分支、新增"提 PR"与 PR 状态展示、移除发布/取消发布按钮；管理台列表展示 PR 状态。CodeMirror / 分屏预览 / WASM 校验全部保留。

## 输入

- 后端写路径场景：`admin.content_save` / `admin.content_pr` / `admin.asset_sync`；
- 在途 `PLAN-DESKTOP-EDITOR-001` 交付的编辑器（CodeMirror + 分屏 + 校验）——**本工作流必须等其归档后串行启动**；
- `SPEC-ADMIN-AUTH-001`：编辑器入口鉴权落地为前置（编辑器是写路径入口、PAT 在服务端，入口必须受保护）。

## 输出

- 保存流：`保存` → `admin.content_save`（同分支追加 commit）→ UI 呈现分支名与最近 commit；
- `提 PR` 动作：调用 `admin.content_pr`，展示 PR 链接与状态（开放 / 已合并）；已合并后提示走手动同步生效；
- 移除 `保存并发布` / `取消发布` 按钮与对应前端逻辑（后端场景退役由写路径工作流负责）；
- 图片上传：编辑器内粘贴 / 选择图片 → `admin.asset_upload` → 代理 URL 插入正文（编辑器升级预留的扩展点）；
- 管理台文章列表：补充 PR 状态列（开放 PR = 草稿在途）；
- 管理台"立即同步"入口（若 PM 与用户定为管理台形态）；
- 401 / 写路径凭证错误的前端呈现。

## 实施任务

1. 保存流改造（DB API → 分支 API）；
2. 提 PR + 状态展示；
3. 发布按钮移除与文案调整（发布指引指向 GitHub merge）；
4. 图片上传接入；
5. 管理台列表与同步入口；
6. Spec 证据回填。

## 测试/验收

- `pnpm --dir src/frontend` 四命令全绿；
- 人工：保存 → 分支 commit、提 PR → PR 开放、merge 后手动同步前台生效；图片上传插入正文；鉴权与凭证错误呈现。

## 阻塞

- 前置：`PLAN-DESKTOP-EDITOR-001` 归档、`SPEC-ADMIN-AUTH-001` 落地、写路径场景就绪。

## 交付记录
