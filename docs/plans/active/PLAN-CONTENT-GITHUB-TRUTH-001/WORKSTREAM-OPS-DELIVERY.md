---
kind: workstream
id: WORKSTREAM-OPS-DELIVERY
status: ready
plan_id: PLAN-CONTENT-GITHUB-TRUTH-001
role: infra
owner: infra
depends_on:
  - WORKSTREAM-BACKEND-READ
write_set:
  - ops/src/
  - ops/tests/
  - docs/guides/operations.md
  - docs/architecture/infrastructure.md
  - docs/specs/SPEC-CONTENT-GITHUB-TRUTH-001.md
last_reviewed: 2026-09-06
---

# 工作流：ops 与交付物（同步命令 / 凌晨 timer / 凭证注入）

## 目标

交付运维侧：`ops content sync` 手动同步命令（或按用户裁定形态）、凌晨定时重启的 systemd timer / cron 模板、凭证与缓存目录注入约定、运维文档。

## 输入

- 后端读路径的同步入口（`admin.content_sync` 场景或进程内等价机制）；
- 交付物哲学：binary + unit + 空数据目录（infrastructure.md 现行约定），timer 模板归本计划、生产化归公网部署计划。

## 输出

- `ops content sync`：调服务器同步场景并输出结果（文章数 / 耗时 / 告警）；手动同步入口的第一形态，管理台按钮由编辑器工作流按裁定评估；
- systemd timer（或 cron）模板：凌晨低峰触发服务重启 → 启动导入；模板入库、生产启用归公网部署计划；
- 环境变量约定文档化：`BLOG_CONTENT_REPO` / `BLOG_CONTENT_TOKEN` / 缓存目录路径（仓库外、FHS 可变数据位）；PAT 申请与最小权限步骤（细粒度、仅该仓库、contents 读写）；
- 运维文档：同步语义（凌晨 + 手动）、失败告警面板 / 日志位置、GitHub 断连 SOP、缓存目录维护。

## 实施任务

1. `ops content sync` 命令 + 测试；
2. timer / cron 模板；
3. 凭证与运维文档；
4. Spec 证据回填。

## 测试/验收

- ops 测试全绿；
- 人工：手动同步演练、timer 本地演练（缩短间隔验证触发与导入）、凭证缺失时的文档化行为核验。

## 阻塞

无。

## 交付记录
