---
kind: plan
id: PLAN-DELIVERY-COMPONENT-RELEASE-001
status: ready
owner: project-manager
created: 2026-10-05
last_reviewed: 2026-10-05
---

# 前后端独立构建与组件化发布

## 目标

让前端（`web/dist`）与后端（Rust binaries + 部署模板）可以**单独构建、单独打包、单独发布**，并接入现有的 `ops delivery` / `ops release` / blog-deploy 安装链。今天改一行 CSS 也要走 nix musl 交叉编译全量发布；拆分后前端发布只跑 vite+wasm 构建，后端发布只跑交叉编译。

分三个阶段，每阶段独立可验收、可停泊：

1. **L1 构建范围拆分**：`ops delivery build` / `ops delivery package` 支持 `--web` / `--backend` 范围参数（默认 both 保持现行为），并支持复用预构建产物（不强制现场重建）；CI（`build-release.yml`）可按步骤选择性执行。
2. **L2 产物拆分**：发布包从单一 `blog-release-<target>-<stamp>.tar.gz` 拆为 `blog-web-<stamp>.tar.gz`（web/dist + 自带哈希清单）与 `blog-backend-<target>-<stamp>.tar.gz`（bin + systemd + nginx）；`MANIFEST.json` 升级 format 2，补齐组件元数据与配套版本。
3. **L3 发布线拆分**：新增 `web-v*` / `backend-v*` tag 与对应 GitHub Actions workflow；blog-deploy 安装器支持按组件选择资产与"仅更新 web"路径（复用既有的 web/dist 替换步骤，不动 bin 与 systemd）。

## 成功标准

1. `ops delivery package --web` 产出的 web 包可通过安装器单独安装：只替换服务器 `web/dist`，不触碰二进制与 systemd，Product 不重启（路由清单未变时页面即生效）。
2. `ops delivery package --backend` 产出的后端包与现状整包的后端部分逐字节等价（bin/systemd/nginx 哈希一致），安装行为不变。
3. web 包具备完整性校验：`SHA256SUMS` 覆盖全部文件（含 `page-routes.json`——现状整包 manifest 不含 web/dist 哈希，是本计划必须关闭的缺口）。
4. 版本配对可判定：任一 web 包能回答"它与哪些 backend 版本兼容"（manifest 元数据），安装器预检能拒绝不兼容组合。
5. 现有 `build-v*` 整包发布线在过渡期保持可用（兼容策略见闸门 G4）；`ops release build --dry-run` 行为不变。
6. 每个 L 阶段收尾时记录实际命令与退出码；安装器侧验证用 `--package` 离线模式 + 一次真实 tag 发布演练。

## 非目标

- 不改运行时挂载契约：Product 经 `BLOG_WEB_DIR`/`--web-dir` 运行时挂载（`src/backend/product/src/cli.rs:113-121,168`）与 `page-routes.json` 启动时载入（`static_files.rs:37-72`）的行为不变。
- 不做 CDN/nginx 直接静态服务改造（页面与 `/api` 保持经 Product 同源）。
- 不拆开发环耦合：`ops quality check` 的前后端合并门禁、`ops e2e --mode integration` 每次重建前端属另一个话题。
- 不消除前端构建对 Rust 工具链的依赖（`wasm:build` 编译 `article-html-wasm` crate，`packages/app/validation/build-article-html-wasm.mjs:12-22`；保留，仅缩小依赖面到 wasm32 target）。
- 与 [PLAN-CONTAINER-DEPLOYMENT-001](../PLAN-CONTAINER-DEPLOYMENT-001/PLAN.md) 的容器运行方案不合并；两者在 `deploy/` 目录有潜在写集重叠，交叉处先对齐再动。

## 约束与依据

- 事实：前后端在产物层已解耦——Product 无编译期嵌入（全仓无 `include_dir`/`rust_embed`），发布包内 `bin/` 与 `web/dist/` 本就分目录，服务器端 web 目录替换是安装器独立步骤（`apps/blog-deploy/src/installer/main.ts:299-300`），systemd unit 以 `--web-dir /var/lib/blog/web/dist` 固定路径。
- 事实：双发布线先例——`script-v*`（仅安装器 mjs）与 `build-v*`（整包）已是两条独立 tag/工作流（`apps/blog/src/release/release.ts:33`、`.github/workflows/{script,build}-release.yml`）；本计划是该模式的延伸。
- 事实：安装器按资产名选择（`apps/blog-deploy/src/installer/release.ts:85`），扩展为按组件+target 选择是局部改动。
- 事实：静态文件按请求读盘（assets 热替换生效），仅路由表启动时快照——"路由变更的前端发布需重启后端"是真实边界。
- 事实：现状 manifest 的 sha256 只覆盖 bin/systemd/nginx（`apps/blog/src/delivery/deploy-plan.ts:19-25`），web/dist 无完整性校验。
- 事实：`ops runtime integration` 已不编后端、期望预构建二进制（`apps/blog/src/runtime/runtime.ts:268-271`）——预构建复用有先例可循。

## 决策闸门

1. **G1 版本配对策略（L2 前置，需产品/用户拍板）**：web 与 backend 之间的 BFF 契约（`/api` 模块、`page-routes.json`）如何声明兼容？候选：a) manifest 内互写"最低配套版本号"；b) 约定兼容窗口（如 N 个 minor 内）；c) 单调递增的契约版本号，两端各自声明支持的区间。未过此闸门不动 L2 的 manifest 字段设计。
2. **G2 manifest format 2 字段集（L2 闸门）**：`format: 2` + `components: { web, backend }` + 各自版本与 sha256 覆盖范围 + `requiresRestart`（以 `page-routes.json` 哈希变化为判据）+ 兼容元数据（依赖 G1）。旧 format 1 字段保留，安装器对 format 1 整包保持向后兼容。
3. **G3 回滚粒度（L3 前置）**：`redeploy` 的幂等语义从"整包"变为"按组件"；回滚是按组件（web 回滚不影响 backend）还是联动（回到上一个共同验证过的组合）。默认建议：按组件回滚 + 安装器记录已安装组件版本清单（`/var/lib/blog/installed.json` 类）。
4. **G4 过渡与整包去留（L3 闸门）**：`build-v*` 整包线保留多久？候选：a) 永久保留（整包=默认安装路径，组件包=增量更新）；b) 过渡 N 个版本后退役整包。默认建议 a——整包仍是全新安装的最短路径。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| L1 构建范围与预构建复用 | frontend | - | `apps/blog/src/runtime/runtime.ts`、`runtime-plan.ts`、`apps/blog/src/delivery/deploy-plan.ts`、`deploy-package.ts`、`apps/blog/test/`（命令测试）、`.github/workflows/build-release.yml` | ready |
| G1 版本配对决策 | 产品+pm | 调研结论 | 本计划决策记录 | ready |
| L2 产物拆分 + manifest v2 | frontend | L1、G1、G2 | `apps/blog/src/delivery/deploy-plan.ts`、`deploy-package.ts` 及测试、`.github/workflows/build-release.yml`（产物校验步骤） | blocked（待 G1） |
| L3 发布线拆分 + 安装器组件化 | frontend | L2、G3、G4 | `apps/blog/src/release/release.ts`、`.github/workflows/`（新增 web/backend workflow）、`apps/blog-deploy/src/installer/*` 及测试 | blocked（待 L2） |
| 收尾与移交 | pm | 全部工作流 | `RESULT.md`、`docs/guides/operations.md`（命令面变化） | pending |

## 集成验收

1. 本地：`ops delivery package --web --dry-run` / `--backend --dry-run` 计划输出正确；实跑产出两类包，`tar -tzf` 清单与 manifest/SHA256SUMS 齐全，篡改任一文件后校验失败（变红证据）。
2. 兼容性：`--backend` 包内 bin/systemd/nginx 与同源整包逐字节一致（哈希对比）；`MANIFEST.json` format 1 整包仍可被现有安装器 `--package` 离线安装（过渡期回归）。
3. 安装器：`deploy --package blog-web-*.tar.gz` 只替换 `web/dist` 且不重启服务（healthz 无中断）；路由变更的 web 包按 `requiresRestart` 重启 Product。
4. 发布演练：一条真实 `web-v1` tag 走完 CI 产资产 → 安装器拉取安装的闭环（或受环境限制时以 `--package` 离线 + 资产名校验测试替代，并明确记录未执行项）。
5. 版本配对：不兼容组合（按 G1 策略构造）被安装器预检拒绝，错误信息含双方版本。

## 未决项

- G1 配对策略（阻塞 L2 字段设计）。
- G3 回滚粒度与已安装组件清单的落点（`/var/lib/blog/` 下的文件归属与格式）。
- aarch64（`aarch64-unknown-linux-musl`）是否随 L2 同步进入拆分线，还是先只拆 x86_64（影响 CI 矩阵）。
- web 包是否需要在构建时注入版本号（HTML meta / `page-routes.json` 字段）以便线上肉眼核对当前前端版本；倾向是，随 L2 一起定。
- `ops delivery build` 的 `--json` 事件流是否需要为范围参数扩展字段（现有消费方核对后定）。
