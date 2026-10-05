# deploy/local — 本地常驻部署

在一台个人机器（macOS 或 Linux/Ubuntu）上以打包产物常驻运行完整博客栈：
`Data(prod SQLite) → Product(同源挂载前端 dist)`，登录即写、开机自启、崩溃自动重启。
与 `deploy/README.md` 的服务器发布（域名/证书/nginx）互补：这里只有 loopback 访问，不对外服务。

## 组成

| 文件 | 职责 |
| --- | --- |
| `serve.mjs` | 跨平台守护本体：读 `local.json` → 起 Data → 等 `/healthz` → 起 Product → 任一进程退出即整栈退出交还系统重启；收 SIGTERM/SIGINT 优雅停机。系统单元直接执行它，不依赖 ops/nix shell |
| `config.example.json` | 配置模板（实际配置在 `~/.local/state/blog/local-deploy/local.json`，0600，含秘密不入库） |

安装/卸载走 ops 命令（实现在 `apps/blog/src/local/local-deploy.ts`）：注册 macOS LaunchAgent 或 Linux systemd 用户单元、生成/复用配置、端口预检、健康验证。配置驱动、零环境变量：Rust 二进制要求的管理凭证（`ops admin credentials init` 产物）与 GitHub 内容仓凭证由 `serve.mjs` 解析后只在子进程环境内注入，用户无需导出任何变量。

## 前置（一次性）

```sh
cd <仓库>
ops delivery build                 # 产出 release 二进制与 src/frontend/dist
ops admin credentials init         # 管理端登录凭证（~/.local/state/blog/admin-auth/）
```

## 安装与卸载

```sh
ops local install      # 首次生成默认配置（fixture 内容源），端口预检、注册系统单元、健康验证；幂等，可重复执行以重启
ops local uninstall    # 停止并移除系统单元（配置与数据库保留）
```

- macOS：LaunchAgent `local.blog.server`（RunAtLoad + KeepAlive），登录即起；
- Linux：systemd 用户单元 `blog-local.service`（enable --now）；无登录会话的机器再执行 `loginctl enable-linger $USER`。

## 配置字段（`local.json`）

| 字段 | 说明 |
| --- | --- |
| `repoRoot` | 仓库绝对路径；二进制与 dist 默认按 `src/target/release/{data,product}`、`src/frontend/dist` 推导 |
| `dataBin` / `productBin` / `webDir` | 可选覆盖：不在仓库树内时显式指定（如解包 release tarball 的布局） |
| `stateDir` | 状态目录（SQLite `prod.db`、日志）；默认 `~/.local/state/blog` |
| `productPort` / `dataPort` | 两个服务端口（都必须 loopback，二进制自身也强制校验） |
| `contentSource` | `fixture`（进程内模拟远程，无法走完合并→公开闭环）或 `github` |
| `contentRepo` / `contentToken` | `github` 时必填；对应 `ops content repository init` 用的仓库与 token |
| `adminAuth` | `on`（密码+TOTP 登录）或 `bypass`（免 GUI 登录，默认；仅适合 loopback 个人机，两个二进制都强制 loopback 监听） |

切到 GitHub 真源：编辑 `local.json` 填三个字段后重跑 `ops local install`（幂等，重启栈）。

## 工作台入口（构建期开关）

公开页面默认不显示任何管理入口。本地构建想显示"工作台"入口（桌面首页/全部文章页导航）：

```sh
BLOG_ADMIN_ENTRY=true pnpm -C src/frontend run build
```

注意：**不能用 `ops delivery build` 带这个变量**——ops 的进程包装会剥离所有 `BLOG_*` 环境变量（`packages/cli/cli-core/src/process.ts`），开关无法透传。直接跑 pnpm 构建即可（脚本自带 `wasm:build`）。Product 直接读 dist 目录，重新构建后刷新页面即生效；若想稳妥可在构建后 `ops local install` 重启。

- 该开关是 `vite.config.ts` 的构建期 `define`（`__BLOG_ADMIN_ENTRY__`）：不带参数构建时常量折叠为 `false`，入口不渲染、路由解析不执行（注意是"不渲染"而非"字符串消除"——admin 页面本就打包在同一 dist，且 `/admin/login.html` 路由经由 site-routes 公开下发，入口可见性不是安全边界，真正的门是后端鉴权）；
- 服务器发布链路（`ops delivery package`）不设此变量，线上公开页面永远不显示入口；
- 入口指向 `/admin/index.html`：`adminAuth: on` 时会先 302 到登录页再跳回，`bypass` 时直达工作台；
- 注意入口可见性由 dist 产物决定：之后不带参数重新 `ops delivery build` 会覆盖掉带入口的 dist。

## 日志

- 子进程 stdout/stderr 与守护日志：`~/.local/state/blog/local-deploy/logs/`
- macOS 另可 `launchctl print gui/$UID/local.blog.server`；Linux 另可 `journalctl --user -u blog-local.service`

## 已知边界

- 产物更新（改了代码/dist）需重新 `ops delivery build`，然后重跑 `ops local install` 重启栈；守护不监听文件变化。
- node 路径在安装时钉死在单元文件里；nix profile 升级或更换 node 后重跑 `ops local install`。
- 手机等局域网设备无法访问（二进制强制 loopback）；对外服务走 `deploy/README.md` 的服务器链路。
