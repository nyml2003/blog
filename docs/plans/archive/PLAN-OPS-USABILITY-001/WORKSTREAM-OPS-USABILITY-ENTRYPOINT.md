---
kind: workstream
id: WORKSTREAM-OPS-USABILITY-ENTRYPOINT
status: completed
plan_id: PLAN-OPS-USABILITY-001
role: infrastructure
owner: infrastructure
depends_on: []
write_set: [flake.nix, .envrc, docs/guides/operations.md]
last_reviewed: 2026-09-05
---

# 项目环境入口一致性

## 目标

让 `ops` 在每次重新进入项目环境、从根目录或子目录调用时绑定同一个项目根，不因调用者当前目录而串用其他仓库。

## 实施

- 入口优先使用激活环境提供的 `DIRENV_DIR` 项目根；无激活根时才从当前目录安全向上查找。
- 向上查找遇到根目录或空父路径时立即失败，错误必须可见且不能死循环。
- 已激活环境改变当前目录时继续使用激活项目；未激活环境不得回退到其他项目的 `ops`。

## 验收

- `direnv exec /home/nyml/projects/blog ...` 从 blog 根、blog 子目录和 `/tmp` 发起时均执行 blog CLI。
- `nix develop /home/nyml/projects/blog -c ...` 从根目录和 `/tmp` 发起时均执行 blog CLI。
- 直接 wrapper 在未激活的 `/tmp` 快速返回明确错误。
- 项目环境之间的 `command -v ops` 和帮助标识不串用。
