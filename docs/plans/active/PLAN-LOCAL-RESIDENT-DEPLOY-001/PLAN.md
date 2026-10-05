---
kind: plan
id: PLAN-LOCAL-RESIDENT-DEPLOY-001
status: completed
owner: project-manager
created: 2026-10-05
last_reviewed: 2026-10-05
---

# 本地常驻部署（打包产物 + ops 集成）

## 目标

在个人机器（用户 Mac 先行，Ubuntu 后续）上以打包产物常驻运行完整博客栈：`Data(prod SQLite) → Product(同源挂载 dist)`，登录自启、崩溃自动重启、免 GUI 登录；安装与卸载收进 ops 命令体系（`ops local install|uninstall`）；内容走 GitHub 真源，让本机成为可写作的正式环境（保存 → 提交 PR → GitHub 合入 → 同步 → 公开）。

计划只解决"本机常驻与写作闭环"，不替代服务器对外发布链路（`deploy/README.md`、`apps/blog-deploy`）。

## 成功标准

1. `ops local install` 幂等注册系统单元（macOS LaunchAgent / Linux systemd 用户单元），运行中重复执行语义为重启；`ops local uninstall` 干净卸载且保留配置与数据。
2. 崩溃自愈：任一子进程（Data/Product）退出时守护整栈退出并由系统单元重新拉起，健康检查恢复通过。
3. 配置驱动、零环境变量：`~/.local/state/blog/local-deploy/local.json`（0600）承载端口、内容源、repo/token 与 `adminAuth`；秘密不进仓库。
4. GitHub 真源闭环可用：启动同步把 `main` 快照导入 Data，公开 API 反映线上内容；本机可完成写作链路的推送方向（保存 → 提交 PR → 合入 → 同步）。
5. 本地默认免 GUI 登录（`adminAuth: bypass`，利用二进制强制 loopback 的既有边界）；随时可切回 `on`。
6. 工作台入口是构建期开关：本地构建（`BLOG_ADMIN_ENTRY=true`）在桌面公开页导航显示"工作台"入口；服务器发布链路（`ops delivery package` / `ops delivery build`）永远不显示。
7. 文档同步：`docs/CODEMAP.md`、`docs/guides/operations.md`、`deploy/README.md`、`deploy/local/README.md` 与实际命令面一致。

## 非目标

- 不改服务器发布链路：`ops delivery package`、`install.sh`、服务器 nginx/systemd 模板、`apps/blog-deploy` 均不动。
- 不为本地部署给 Product/Data 增加 Rust 侧新参数或协议；复用既有 `--web-dir`、`--admin`、`--content-source`。
- 不引入运行时公共协议变更来实现入口可见性（入口是构建期决策，不是 API 字段）。
- 不做对外监听、TLS、多用户或远程访问；本地栈仅 loopback。

## 约束与依据

- 协作规则：`AGENTS.md`（变更安全、验证标准、Plan 语义）；用户已接受决策：入口可见性走构建期参数（本地能用、线上规避）、本地部署去掉 GUI 登录、常驻实现走 ops 体系、配置用单一 JSON（尽量不用环境变量）、实现用 `.mjs` 并跨平台。
- 内容契约：`docs/content-repo/CONTRACT.md`（空仓仅 `taxonomy.json`；公开可见性 = 目录存在于 `main`；服务端无合并操作）。
- 管理鉴权：`SPEC-ADMIN-AUTH-001`（`--admin on|off|bypass` 语义；bypass 仅限本地/可信环境）。
- 既有命令面：`docs/guides/operations.md`（`runtime` 三模式与 Data 语义说明）。
- 实现依据：`src/backend/product/src/cli.rs`、`src/backend/data/src/cli.rs`（两二进制均强制 loopback）；`packages/cli/cli-core/src/process.ts`（ops 子进程剥离 ambient `BLOG_*`，构建开关无法经 ops 透传——已写入 README 警示）。
- 服务器发布链路的守护与 systemd/nginx 是另一套（`deploy/systemd/` 是服务器 unit，与本计划的**用户级**单元不同层）。

## 工作流

| 工作流 | Owner | 依赖 | Write set | 状态 |
| --- | --- | --- | --- | --- |
| 守护与 ops 集成 | infrastructure + ops | - | `deploy/local/`、`apps/blog/src/local/`、`apps/blog/src/registry.ts`、`docs/guides/operations.md`、`docs/CODEMAP.md` | completed |
| GitHub 真源接入 | infrastructure | 守护与 ops 集成 | `local.json`（本机，不入库） | completed |
| 工作台入口构建期开关 | frontend | - | `src/frontend/vite.config.ts`、`src/frontend/vite-env.d.ts`、`packages/app/pages/desktop-home/`、`packages/app/pages/desktop-articles/` | completed（WSL 浏览器验收通过，2026-10-05） |
| 免 GUI 登录（bypass） | infrastructure | 守护与 ops 集成 | `deploy/local/serve.mjs`、`deploy/local/README.md` | completed |
| Ubuntu/systemd 验收 | infrastructure | 守护与 ops 集成 | 无（仅验证记录） | completed（WSL2 Ubuntu 24.04，2026-10-05） |
| 收尾：提交、全量门禁、RESULT | project-manager | 上述全部 | 本计划目录、提交 | partial（门禁与收尾记录完成；提交待用户确认） |

## 进度记录

### 2026-10-05 立项并完成主路径（本机）

**实际交付**

- `deploy/local/serve.mjs`：跨平台守护本体。读 `local.json`（0600）→ 端口预检 → 起 Data(prod SQLite) → 等 `/healthz` → 起 Product（挂载 dist）→ 任一子进程退出整栈退出交还系统单元；SIGTERM/SIGINT 优雅停机；`adminAuth` 支持 `on|bypass`；凭证（admin 三件套、content repo/token）由它解析后仅注入子进程环境。
- `apps/blog/src/local/local-deploy.ts` + `registry.ts`：`ops local install` / `ops local uninstall`。生成/复用配置、注册 macOS LaunchAgent 或 Linux systemd 用户单元、健康验证；修复两个真实缺陷：bootout 异步收尾竞态（等 label 消失 + 端口释放后再 bootstrap，带重试）与"服务运行中 install 被端口预检误报"（识别自身 → 重启语义）。
- 工作台入口构建期开关：`vite.config.ts` 读 `BLOG_ADMIN_ENTRY` → `define __BLOG_ADMIN_ENTRY__`；桌面首页/全部文章页导航条件渲染"工作台"（指向 `/admin/index.html`，`Show when={false}` 时不渲染且不做路由解析）。服务器发布链路不含此变量。
- 文档：`CODEMAP.md`（命令域加 `local/`）、`operations.md`（`ops local install` 行）、`deploy/README.md`（互链）、`deploy/local/README.md`（完整指南，含"ops 剥离 `BLOG_*`，开关须直接 pnpm 构建"警示）。

**已验证（证据）**

| 项 | 证据 | 结果 |
| --- | --- | --- |
| ops 契约测试 | `pnpm -C apps/blog test`（两轮） | 106 pass / 0 fail |
| 前端静态检查 | `pnpm -C src/frontend run typecheck` | exit 0 |
| 构建开关折叠 | 带开关构建后 `dist/` 无 `__BLOG_ADMIN_ENTRY__` 残留 | 通过 |
| 卸载/安装/重装 | `ops local uninstall` → label 移除+服务停止；`ops local install` → 注册+健康通过；运行中重装 → 识别自身走重启 | 通过 |
| 崩溃自愈 | 杀掉 product → 整栈退出 → launchd 自动拉起 → 约 14s 恢复首页 200 | 通过 |
| GitHub 真源同步 | 切换 `nyml2003/blog-content` 后重启，日志 `content_snapshot_replace` 成功；`/api/public/articles` total=3（1001/1002/1003） | 通过 |
| 免 GUI 登录 | Product 进程参数 `--admin bypass`；无凭证 `/admin/index.html`→200、`/api/admin/content/workspace`→200（此前为 302/401） | 通过 |

**未交付/未验证**

- "工作台"入口的浏览器渲染验收（客户端渲染，curl 不可见）——待用户浏览器确认。
- 写作链路的推送方向（保存 → 提交 PR → 合入 → 同步）未在本机实跑；不在真实仓库上未经授权开 PR。当前仓库已有 3 篇线上文章，拉取方向已验证。
- Linux/systemd 路径未在真机验证（仅代码级）。
- 改动全部未提交（工作树含其他并行改动：`ops release --allow-dirty`，提交时勿混）。
- `ops quality check` 全量未跑（本计划触碰前后端 + ops 三个面）。

**停止/替代原因**：无。计划继续，剩余为验收与收尾。

### 2026-10-05 WSL2 验收（新设备）

**环境变化**：执行设备由 Mac 换为 WSL2 Ubuntu 24.04（systemd 255，mirrored 网络）。Node 改由 nvm 管理（24.21.0），pnpm 11.26.0；项目 Flake 不再提供 node/pnpm（只提供 Rust 工具链与 ops wrapper），`ops local install` 钉住的 node 取运行 ops 时的全局 node。Windows 侧 8080 已被 portproxy 占用且 mirrored 网络下 WSL 无法绑定，本地栈端口改为 8090/8091。

**实际交付（本次改动，仓库内未提交）**
- `nix/flake.nix` 去掉 `nodejs_24` 与 `pnpm`；`origin` 发布两条 workflow 加 `actions/setup-node@v4` + `pnpm/action-setup@v4`；`package.json` 钉 `packageManager: pnpm@11.26.0`。
- `apps/blog/src/local/local-deploy.ts` 的 `resolveNodePath` 改为 `process.execPath`；README/operations/deploy-local 文档同步。
- 修复既有测试隔离缺陷：`src/backend/product/src/static_files.rs` 两个测试共用 `product-static-{pid}` 临时目录，并行必失败；改为原子计数唯一目录。

**已验证（证据）**

| 项 | 证据 | 结果 |
| --- | --- | --- |
| 安装/幂等重装/卸载 | 首次 install → unit active、健康 200；运行中 install → 重启；uninstall → unit 移除、8090/8091 释放、local.json 与 prod.db 保留；再次 install → 恢复 200 | 通过 |
| 崩溃自愈 | 杀 product → 整栈退出（status=1）→ systemd 拉起，13s 恢复；杀 data → 8s 恢复；均无孤儿进程占端口 | 通过 |
| 免 GUI 登录（bypass） | 无凭证 `/admin/index.html`→200、`/api/admin/content/workspace`→400（鉴权已放行，仅缺场景参数） | 通过 |
| adminAuth=on | `/admin/index.html`→302 `login.html?next=...`、`/api/admin/content/workspace`→401；切回 bypass 后恢复 | 通过 |
| 无登录会话常驻 | `loginctl enable-linger nyml` → `Linger=yes` | 通过 |
| 全量门禁 | `ops quality check` → `success OK (0)`（含修复后的 cargo test；Node 24.21 + nix dev shell） | 通过 |
| Windows 可达（mirrored） | Windows `curl.exe http://127.0.0.1:8090/`→200 | 通过 |
| GitHub 真源拉取（WSL） | systemd 用户环境注入代理后启动，日志 `content_snapshot_replace status=OK`；`/api/public/articles?sceneCode=public.article_list` total=3（1001/1002/1003） | 通过 |
| 工作台入口构建期开关 | `BLOG_ADMIN_ENTRY=true pnpm -C src/frontend run build` 成功；产物含“工作台”与 `/admin/index.html`，无 `__BLOG_ADMIN_ENTRY__` 残留；服务已重启加载新 dist | 通过（用户 Windows 浏览器确认入口正常） |

**未交付/未验证**
- GitHub 真源：拉取方向已在 WSL 验证（启动 `content_snapshot_replace` OK，公开 API total=3）；推送方向（真实 PR）仍需用户授权。systemd 用户服务不继承 shell 代理，已在 Home Manager `systemd.user.sessionVariables` 注入同一套 FlClash 代理。
- Windows 登录自启：WSL 发行版需 Windows 侧触发（计划任务/启动项）才能做到“不开终端也自启”；linger 已开，方式待决策。
- 改动未提交。`ops delivery build` 首次失败是当前 shell PATH 残留旧 `~/.local/bin/node`（v22.17，默认不擦除 TS）所致；用 nvm Node 24.21 干净 PATH 后构建通过，非项目缺陷。

## 集成验收

1. macOS 浏览器：打开 `http://127.0.0.1:8080/`，导航出现"工作台"，点击直达 `/admin/index.html`（bypass 免登录）；`adminAuth: on` 时同一路径 302 登录后跳回。
2. 写作闭环（需用户授权在真实仓库开 PR）：新建/编辑文章保存 → 列表可见 → 提交 PR → GitHub 合入 → 同步 → 公开 API 可见。
3. 杀 Data 与 Product 各一次，确认整栈自愈且无孤儿进程占端口。
4. Ubuntu：`ops local install` 走 systemd 用户单元；无登录会话场景验证 `loginctl enable-linger`；`ops local uninstall` 干净。
5. 关闭入口开关重新构建（不带 `BLOG_ADMIN_ENTRY`），确认公开页不渲染入口；README 中命令逐条可执行；`git diff --check` 通过。
6. 运行 `ops quality check`，在 RESULT 中区分已执行与受环境限制的检查。

## 收尾记录（2026-10-05）

- 实际交付：本地常驻部署（`ops local install|uninstall`、幂等重启、崩溃自愈）、免 GUI 登录（bypass）、工作台入口构建期开关（用户浏览器验收通过）、GitHub 真源启动同步（拉取方向）、WSL2/systemd 验收、`ops quality check` 全绿；开发环境切换为 nvm Node 24.21 + pnpm 11.26（Flake 不再提供 node/pnpm），CI 与文档同步。
- 未交付：写作闭环推送方向（真实 PR）未执行（待用户对真实仓库授权）；Windows 侧登录自启未添加（用户决策暂不加，linger 已开）；本轮改动未提交。
- 停止/替代原因：剩余项依赖用户授权或本机外配置（Windows 计划任务、真实仓库 PR），计划目标与验收范围均已在 WSL 完成。
- 恢复条件：用户授权在 `nyml2003/blog-content` 开 PR 验证推送闭环；决定是否提交本轮改动。

## 未决项

- 是否给 `ops delivery build` 增加构建参数透传（或显式选项）以承载 `BLOG_ADMIN_ENTRY`；当前须直接 `pnpm -C src/frontend run build`。涉及 ops 命令契约，另立决策。
- 入口浏览器验收与推送方向闭环的执行时机：并入用户真实写作时验证，还是先造测试数据；倾向前者（真实首篇即验收）。
- `adminAuth: bypass` 在 Ubuntu 常驻是否同样默认；安全定位依赖"二进制强制 loopback"，若未来引入非 loopback 监听必须重新决策。
- 与 `PLAN-DELIVERY-COMPONENT-RELEASE-001`、`PLAN-CONTAINER-DEPLOYMENT-001` 在 `deploy/` 的潜在写集交叉：本计划只新增 `deploy/local/` 并动 `deploy/README.md` 一行互链；若交叉处冲突先对齐再改。
- `serve.mjs` 守护逻辑本身无自动化测试（ops 契约测试只覆盖命令元数据）；是否需要进程级回归测试，待 Linux 验收后评估。
- WSL 端口固定为 8090/8091（Windows 8080 被 portproxy 占用且 mirrored 下冲突）；是否改 Windows portproxy 或维持现状，待决策。
- Windows 侧登录自启：用户已决策暂不加（2026-10-05）；linger 已开启，Windows 重启后需手动开一次终端（或运行 `wsl`）拉起发行版。
- 根 `pnpm typecheck` 仍有 4 个既有报错（`process.getuid` 可选类型、`__BLOG_ADMIN_ENTRY__` 未在 packages/app 的 tsconfig 声明），不在 `ops quality check` 门禁内，非本计划引入。
