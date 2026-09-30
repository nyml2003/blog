# 计划结果

## 计划

- Plan ID：`PLAN-MOBILE-EXPERIENCE-OPTIMIZATION-001`
- 最终状态：`completed`（按 2026-09-30 产品决策收敛后的范围，范围变更记录见 PLAN.md）
- 项目经理：`project-manager`

## 收尾说明

本计划立项时按"审计先行、决策闸门、再实现"设计，范围过宽。执行中产品带着真实部署反馈的两个具体问题（页面切换后加载慢、底栏抖动）直接决策：先建度量能力并确认指标，再按数据实施优化。收尾时产品明确将本轮范围收敛为"度量能力 + 两项 P0 优化"，其余审计项与产品决策题整体移出、移交后续计划（见 PLAN.md 范围变更记录）。收敛后的范围全部交付、验证并发布。

## 实际交付

- 性能度量能力：`ops perf mobile` 命令（Playwright 采样：冷加载/底栏切换 × unthrottled/slow4g/slow3g 网络档位，CDP 网络仿真），指标含壳/内容可见耗时、FCP/LCP、传输字节与缓存命中；支持 `--mode integration`（隔离栈迭代）与 `--origin`（线上验收），报告写入 `target/e2e/<run-id>/perf-report.json`。
- 性能基线与优化对比证据：[BASELINE-PERF.md](./BASELINE-PERF.md)。
- P0-1 静态资源缓存与压缩：`static_files.rs` 对 `/assets/*` 返回 `Cache-Control: public, max-age=31536000, immutable`、HTML 返回 `no-cache`；nginx 模板开 gzip（含 `gzip_proxied any`）。
- P0-2 site-routes 构建期内嵌：Mobile bootstrap 不再发 `/api/public/site-routes` 请求，首绘零网络前置；配套 schema 守卫测试与 CODEMAP 更新。后端接口保留（desktop 仍使用）。
- 关联交付（发布链路）：交叉编译工具链锁定进 flake.lock（`./nix#cross`，替代滚动的 `nixpkgs#` 注册表引用）、打包失败输出保留末尾 12000 字符逐行打印、CI rust 锁定 1.98.1——修复 build-v0.1.5 的 musl 交叉编译失败（工具链漂移），build-v0.1.6 发布成功。

## 已验证内容

| 验收项 | 证据 | 结果 |
| --- | --- | --- |
| 度量命令契约 | `apps/blog/test/commands/perf.test.ts` 10 项；apps/blog 全量 119 项测试通过 | passed |
| 缓存头契约 | `cargo test -p product`（含 static_files 缓存头断言）159 项通过 | passed |
| 前端内嵌改动 | tests/app 范围 typecheck、oxlint、page-template/mobile 测试通过；`ops e2e --mode integration` 浏览器旅程通过 | passed |
| 优化效果（本地 integration 栈） | `ops perf mobile --runs 3`：slow3g 切换→内容 5879ms→1697ms（-71%）、底栏可见 5101ms→918ms（-82%）、传输 183.6KB→15.6KB、缓存命中 6/8；详见 BASELINE-PERF.md | passed |
| 发布链路 | 本地 `ops delivery package` 端到端通过；CI build-v0.1.6 成功发布 | passed |
| 线上真实链路验收 | 用户确认发布与部署完成（build-v0.1.6 redeploy）；`--origin` 采样数字未留存记录 | accepted |

## 移出范围（后续计划的输入，非本计划未完成项）

- 完整体验审计的 9 项清单（触控目标、读屏、375/390/430 viewport 矩阵、横屏、错误/离线恢复旅程、管理预览差异等），保留在 PLAN.md 探查章节。
- P1 底栏静态骨架：产品决策暂缓，视真机效果再定；SPA 式导航与 Frontend 架构清理 Plan 存在写集重叠，需协调。
- 小额技术债：schemas chunk 瘦身（111KB zod）、category-shelf 接口缓存、favicon 404、`ops delivery installer` 的 esbuild 未锁版本。
- 全量 `ops quality check` 在收尾时因并行 Desktop 迁移的预存 typecheck 错误（`taxonomy-state` 缺失）无法通过；本计划改动以范围化检查（Rust/前端分域测试、typecheck、lint、E2E、perf 采样）替代。
