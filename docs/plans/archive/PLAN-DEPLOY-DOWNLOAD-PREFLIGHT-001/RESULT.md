# 计划结果

## 计划

- Plan ID:`PLAN-DEPLOY-DOWNLOAD-PREFLIGHT-001`
- 当前状态:`completed`
- 收尾日期:2026-10-01

## 已交付

- `@fluvient/core/http` 共享传输内核:分档超时(响应头/读体空闲/总时限)、取消、流式读体+进度回调、按原因错误分类(dns/tls/connection/reset/timeout/status/transport + retryable)、可选指数退避重试;`@fluvient-loom/net` 收敛 web/node 两份重复的 fetch NetworkPort 适配器(计划外派生成果)。
- `blog-deploy` 三个下载型命令(deploy/redeploy/self-update)统一网络预检:DNS → TCP → TLS → Release API → 资产探测(HEAD 优先,无 Content-Length 回退 Range,瞬断重试最多 3 次),失败按分类给建议动作并在下载前终止。
- 下载可观测性:阶段事件、TTY 进度条(总量未知不伪造百分比)、非 TTY 周期进度、`--json` 纯 NDJSON(stdout 无人类文本);稳定错误码 `PREFLIGHT_FAILED`/`DOWNLOAD_FAILED`/`CHECKSUM_MISMATCH` 附 retryable。
- dry-run 完成 Release 解析与网络预检,明确无副作用;`redeploy --package <tarball>` 离线安装,校验/安装/重启链路与在线一致。
- 失败安全:预检/下载/校验失败不触碰旧文件,临时文件清理,self-update 锁/备份/回滚保留;清除了 installer 的 35 处 `console.*` 直写(补齐 SPEC-OPS-OUTPUT-001)。
- 文档:`deploy/README.md` 预检/下载行为与离线安装章节、operations guide 排障入口、命令帮助更新。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| blog-deploy 测试 | 21/21 通过(预检阻断、探测重试、HEAD→Range 回退、下载重试流式写盘、进度条渲染、JSON 纯净性端到端、离线安装三条路径) |
| 全仓 typecheck / JS 测试 | 通过(core 21、net 7、blog 107 等) |
| esbuild 单文件 bundle + `--help` 冒烟 | 通过(108.7kb;注:macOS 符号链接临时路径会令 `isEntry` 失效,须在真实路径冒烟) |
| 真实服务器受限网络实测 | 通过:预检拦截资产 CDN 不可达;复跑预检通过、进度条与限速场景正常(2026-10-01,script-v0.1.15,阿里云) |

## 收尾说明

- 未交付:CI/运维脚本事件消费者接入、默认超时/重试参数的系统化标定(当前为工程默认,真实服务器单次验证可用);恢复条件见 PLAN.md 验收记录。
- 计划外决策沉淀:共享内核 `@fluvient/core`(Result/取消原语)与 `@fluvient-loom/net` 的归属已在 CODEMAP/SPEC-ARCH-BOUNDARY-001 同步。
- 关联提交:e9e4db5(预检/进度/重试与内核)、56114ae(文档)、0b4753a(--package 离线安装与预检探测重试)。
