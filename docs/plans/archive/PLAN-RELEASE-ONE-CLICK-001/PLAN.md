---
kind: plan
id: PLAN-RELEASE-ONE-CLICK-001
status: completed
owner: project-manager
created: 2026-09-29
last_reviewed: 2026-09-29
---

# 一键发布 Build 与 Script

## 目标

把当前“分别创建 `script-v*` / `build-v*` tag，再等待 GitHub Actions 发布”的流程整理成可预检、可追踪、低误操作的一键发布流程，统一通过 `ops release` 执行。只有现有 workflow 无法满足时，才扩展 CI。

## 当前基线

- `.github/workflows/script-release.yml` 在 `script-v*` tag 上构建并发布 `blog-deploy.mjs`；也支持 `workflow_dispatch`。
- `.github/workflows/build-release.yml` 在 `build-v*` tag 上构建 x86_64 musl 发布包；也支持 `workflow_dispatch`。
- `deploy/README.md` 已记录：安装器有改动打 `script-vX.Y.Z`，二进制或页面有改动打 `build-vX.Y.Z`；服务器 `redeploy` 自动取最新稳定 `build-v*`。
- `ops delivery build` 只构建本地前端与 Rust 交付物；`ops delivery package` 生成发布包；`ops delivery installer` 生成安装器。它们不是 GitHub Release 发布命令。
- 当前工作流已实现“tag 触发发布”，但需要核对版本校验、tag 与提交关系、重复 tag/重复发布、workflow_dispatch 的输入、资产完整性和发布后的可用性。

## 目标流程

```text
检查工作树
  → 预检 release 类型并自动确定版本号
  → 创建一个或两个受控 tag
  → 推送 tag
  → GitHub Actions 构建、校验并发布 Release 资产
  → 检查 Release 状态、资产和安装器可下载性
  → 可选：服务器 dry-run / redeploy 验收
```

“一键”默认只表示本地一次命令完成预检、tag 创建和推送；GitHub Actions 仍是远程构建与发布边界。服务器更新是否自动执行必须单独显式选择，不能因发布 tag 隐式重启线上服务。

## 发布类型与范围

| 类型 | Tag | 资产 | 触发条件 |
| --- | --- | --- | --- |
| Script | `script-vX.Y.Z` | `blog-deploy.mjs` | 安装器、部署脚本或 installer 运行逻辑变化 |
| Build | `build-vX.Y.Z` | x86_64 musl 发布包 tarball | Rust、前端、systemd/nginx 模板或交付包变化 |
| 双发布 | 分别创建两类 tag | 两套资产 | 两类资产必须来自同一提交，但不强制使用同一版本号 |

版本格式继续使用 `vMAJOR.MINOR.PATCH`；版本号由 `ops release` 根据现有发布记录自动递增，不要求手工输入下一个版本号。本计划不引入 nightly 或预发布版本。

## 边界与安全规则

- 发布命令默认拒绝脏工作树、非目标分支、tag 已存在、版本格式错误和 tag 指向非当前提交；强制覆盖或删除远程 tag 不属于一键发布。
- 推送前必须显示将创建的 tag、提交 SHA、发布类型和远程仓库，并要求显式确认；非交互 CI/脚本模式必须有等价的明确 switch。
- tag 推送成功后不把 GitHub Actions 的异步完成伪装成命令成功；命令至少输出 workflow URL/Release 检查提示，若具备 GitHub CLI/API 能力再提供等待与轮询。
- 只发布公开资产，不把 token、管理凭证、内容仓库凭证或本地配置打入产物；继续使用现有 checksum 和 installer 校验链路。
- 发布脚本不修改服务器、不触发线上 `redeploy`；服务器更新保留独立命令和人工确认。
- 本地预检和远程发布应可重复执行；重复运行应报告已存在的 tag/Release，而不是覆盖资产。

## 成功标准

1. 明确现有两个 workflow 的触发、产物命名、权限、重复运行和失败行为；至少补齐一条可执行的预检/发布入口，或用文档证明现有 tag 命令已经足够并补齐缺口。
2. 发布入口能区分 Script、Build 和双发布，校验版本、当前提交、工作树、tag 冲突和目标仓库；失败发生在推送前时不产生远程副作用。
3. `script-v*` 和 `build-v*` 资产均有自动化检查：Release 存在、资产名称符合约定、下载可达、checksum/installer 冒烟通过；Build 发布包不含秘密，Script bundle 可执行并能展示帮助。
4. 双发布场景能证明两类 tag 指向同一提交，或明确记录为什么允许不同 tag/版本；服务器 `redeploy` 仍能选到预期的最新稳定 Build。
5. 发布说明、失败恢复、tag 不可覆盖规则和服务器更新步骤写入当前指南；不改变已有 API、运行时和安装器业务语义。
6. 至少完成一次非生产 Release 演练或使用 GitHub dry-run/测试仓库验证；真实生产发布、服务器 redeploy 和权限验证分别记录，不用本地构建替代。

## 非目标

- 不把发布和线上部署绑定成一个不可拆分的命令；
- 不自动修改或删除已有 tag、Release，不覆盖历史资产；
- 不在本计划中改写 Product/Data 构建内容、installer 下载协议或服务器配置格式；
- 不为方便发布而把 GitHub token、服务器密钥放入仓库、命令参数或日志；
- 不默认增加 arm64 发布资产；现有 x86_64-only 发布范围保持不变，除非另立决策。

## 约束与依据

- `.github/workflows/script-release.yml`、`.github/workflows/build-release.yml`：当前 tag 触发和 Release 资产实现。
- `deploy/README.md`：当前发布、安装器更新和服务器 redeploy 操作说明。
- `docs/plans/archive/PLAN-OPS-FRAMEWORK-001/RESULT.md`：installer 已完成本地 bundle/冒烟验证，但真实服务器验收未执行。
- `apps/blog/src/delivery/**`、`apps/blog-deploy/src/installer/**`：本地交付包、installer、版本解析和 checksum 行为。
- `docs/guides/operations.md`：`ops delivery build/package/installer` 命令边界。
- 依赖、CI 权限、Release 写入和网络验证按项目变更安全规则处理；不擅自批准依赖安装或全局配置修改。
- 长期方向：仓库根目录 `scripts/` 应逐步收敛为受控的构建辅助、一次性迁移或专项测试工具，不继续承载长期业务入口。新增发布能力优先放入 `apps/blog` 的 CLI/应用层或明确归属的测试工具层；现有脚本在迁移前保持可用，不因本计划顺手删除。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 发布现状与版本契约盘点 | release+pm | - | 本计划、workflow/README 对照、版本规则记录 | completed |
| 预检与一键入口 | release | 现状盘点 | `ops release`、相关测试、必要的 CLI registry | completed |
| CI 资产与重复发布护栏 | release+ci | 现状盘点 | `.github/workflows/**`、CI 测试/文档 | completed |
| 发布后验收与指南 | release+deploy | 预检与 CI 护栏 | `deploy/README.md`、`docs/guides/operations.md`、演练记录 | completed |

workflow、tag 预检、CLI registry 和锁文件属于共享写集，必须串行修改。若判断“只需打 tag”，仍需完成现状盘点和一次演练，不以口头判断替代证据。

## 集成验收

1. 在干净提交上执行 Script、Build 和双发布预检；故意使用脏树、错误版本、已存在 tag、错误分支和不同提交，确认均在推送前失败。
2. 在测试/非生产范围推送 tag 或使用等价 CI 演练，确认两个 workflow 产出预期 Release 资产；检查下载、checksum、installer `--help` 和发布包清单。
3. 检查发布失败后的恢复路径：不覆盖历史 tag，修复后使用新版本号；远程 workflow 失败不会被本地命令误报为成功。
4. 运行相关 CLI/ops 测试、质量检查和必要的 `ops delivery package/installer` 冒烟；真实服务器 `redeploy` 只有在明确授权和环境具备时执行，并单独记录。
5. 计划收尾记录已实现的一键程度、仍需 GitHub 页面或人工确认的步骤、未执行的生产验证和后续条件；允许以 `partial` 收尾。

## 未决项

- `ops release` 的自动递增规则如何从现有 tag/Release 记录计算下一个版本；由版本契约盘点确定并保持可重复执行。
- 双发布是否允许只发布其中一类资产；同一提交要求已确定，版本号不要求相同。
- 是否使用 GitHub CLI/API 等待 workflow 和校验 Release；若使用，需明确 token 来源、权限和缺失时的降级行为。
- 发布完成后是否只输出 redeploy 命令，还是提供需人工确认的下一步提示；默认不自动触发线上变更。
