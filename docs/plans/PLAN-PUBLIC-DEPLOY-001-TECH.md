# PLAN-PUBLIC-DEPLOY-001 技术方案(工作块 A + B)

- 状态:已定稿(2026-09-26);A 块已实施,公网只读模式已实施;B 块待服务器准备
- 上游:[PLAN-PUBLIC-DEPLOY-001](./PLAN-PUBLIC-DEPLOY-001.md)(目标、范围、验收、决策点)
- 本文回答"具体怎么做";执行清单、验收复选框仍在计划文件
- 结论:A 块改 ops 参数框架后放行 `--data prod`;B 块纯部署执行;公网只读(决策点 8)已并入方案

## 1. 系统总览

### 组件与端口

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| nginx | 服务器 `:80`/`:443` | 唯一公网入口;80 → 443;TLS 终止;反代到 Product |
| Product | 服务器 `127.0.0.1:17800` | 公开页面(dist)+ `/api`;`--admin off` 公网只读;GitHub 启动同步 |
| Data | 服务器 `127.0.0.1:17801` | SQLite 缓存与事务操作;prod 语义:自动迁移、不 seed、退出不删 |
| SQLite | 服务器 `/var/lib/blog/blog.db` | 可重建的运行缓存,内容真源是 GitHub 私有仓库 |
| 内容仓库 | GitHub `nyml2003/blog-content` | 文章/分类/标签真源;PR 合入才发布 |
| systemd | `blog-data.service`、`blog-product.service` | 开机自启、失败重启、权限加固 |

```text
Browser --HTTPS--> nginx:443 --HTTP(loopback)--> product:17800 --HTTP(loopback)--> data:17801 --> blog.db
                                                    |
                                                    +--HTTPS--> GitHub content repo (PR / 同步)
```

### 数据流(发布链路)

1. 本地编辑栈(mac,`--admin bypass` 或 `on`)保存只写本机工作区,不上公网、不改前台;
2. 工作台整批提交 → Product 写一个分支 + 一个 PR,服务器不自动合并;
3. 用户在 GitHub 合入 `main` → SSH 重启公网 Product(`systemctl restart blog-product`)触发启动同步 → 拉取固定 commit → Data 单事务替换公开快照;
4. 公开端只读最后成功同步的快照;未合入 PR 的内容不可见。

### 安全边界

- TLS 必须是唯一入口(公网内容也值得链路加密与完整性);
- Product/Data 只 `listen 127.0.0.1`,不直接暴露公网;
- 公网 Product 以 `--admin off` 运行:管理页面与管理 API 一律 404,不存在登录入口,攻击面只剩公开读接口;
- nginx 对 `/admin`、`/api/admin/` 另加 404 兜底,但不是唯一防线(真正的"没有管理面"由 Product 保证);
- 转发信息只在 peer=127.0.0.1、`X-Forwarded-For` 为单一合法 IP、`X-Forwarded-Proto=http/https` 时采用(因此 `BLOG_TRUSTED_PROXY_IPS=127.0.0.1`);
- 服务器唯一凭证是 `product.env`(content token,root 0600);本地编辑栈的管理凭证或 bypass 只存在于 mac,不入仓库、不进 unit 明文。

## 2. 工作块 A:ops 放行 prod(技术方案)

### 2.1 现状(已核实)

| 事实 | 证据 |
| --- | --- |
| `DATA_MODES` 只有 mock/test | ops/src/domain/runtime-plan.ts:6 |
| `--data` 注册引用该常量,帮助示例已出现 prod | ops/src/interface/registry.ts:109,111 |
| spawn 仅 test 注入数据库路径(环境变量) | ops/src/application/runtime.ts:253-255 |
| ops 清除 ambient `BLOG_*`,prod 路径必须显式 CLI | docs/guides/operations.md:50 |
| 参数模型只有 int32/enum/switch;有值参数一律必填 | ops/src/domain/parameters.ts:4-7、ops/src/interface/parser.ts:52-57 |
| Spec 明确不实现 string/path,禁止 default/env/validate 钩子 | docs/specs/SPEC-OPS-PARAMETERS-001.md:15,19,33 |
| handler 异常没有 10 退出通道 | ops/src/interface/cli.ts:172,186-188 |
| Data CLI:prod 必须显式 `--data-database-path` | src/backend/data/src/cli.rs:6-10 |

### 2.2 设计

**新值模型 `path`**

- 声明 `{ kind: 'path' }`;
- 必须显式给值;非空、不含 `\n`/`\r`;不 trim、不展开 `~`、不做路径规范化,原样返回 string;
- 不做通用 `string` 模型:当前唯一需求是路径,按 Spec 原有最小原则。

**`optional` 可选参数**

- `ParameterSpec` 增加 `optional?: true`,只允许有值参数;switch 按出现取值,位置参数保持必填;
- 未出现时参数键缺失,不算错误、无默认值、不接受环境变量补值;出现时正常解析,重复出现仍报错;
- 帮助:用法行显示 `[--database-path <path>]`,参数行标注「可选」。

**组合校验与退出码**

| `--data` | `--database-path` | 结果 |
| --- | --- | --- |
| `prod` | 缺失 | 用法错误 10 |
| `prod` | 提供 | 通过 |
| `mock`/`test` | 缺失 | 通过 |
| `mock`/`test` | 提供 | 用法错误 10 |

- 校验放 `planMode`(领域层):这是模式组合语义,不是通用解析规则;Spec 禁止字段级钩子;
- 10 的通道:handler 抛 `OpsError('USAGE', message, [], EXIT_USAGE)`,`cli.ts` 捕获后复用 `usageError` 渲染(stderr 说明 + stdout 最近帮助),其余异常维持 20;
- 错误文案:`--data prod 必须显式提供 --database-path`;`--database-path 仅允许与 --data prod 一起使用`。

**数据通路**

- `ModeOptions.backend` 加 `databasePath?: string`;`ModePlan` 加 `databasePath: string | null`;
- `runtime.ts`:prod 时 `args.push('--data-database-path', path)`;test 保留 `BLOG_DATABASE_PATH` 注入;mock 不变。

### 2.3 Spec 修订点(SPEC-OPS-PARAMETERS-001)

1. 范围:模型集合改为 `int32 | enum | path | switch`,删除"不实现 path";
2. 模型表:新增 `path` 行(2.2 解析契约);
3. 元数据:允许 `optional`;继续禁止 default/env/validate/自定义钩子;
4. 缺省语义:仅 switch 与 optional 有值参数允许缺省;
5. 当前命令表:`runtime backend` 的 `--data` 加 `prod`,新增可选 `--database-path` 及组合约束;
6. 帮助与退出码:可选性展示;组合校验失败=10(帮助输出、零副作用);
7. 验收映射:补 path/optional/组合/帮助/spawn 测试项;
8. 决策记录:追加 2026-09-26 修订及原因。

### 2.4 代码改动与测试

| 文件 | 改动 |
| --- | --- |
| `docs/specs/SPEC-OPS-PARAMETERS-001.md` | 按 2.3 修订 |
| `ops/src/domain/parameters.ts` | `ValueModel` 加 `path`;optional 校验与描述 |
| `ops/src/interface/value-parser.ts` | path 校验分支 |
| `ops/src/interface/parser.ts` | optional 缺失不报错 |
| `ops/src/domain/commands.ts` | `ParsedArgs` 可选键、`argumentsMatch`、注册校验 |
| `ops/src/interface/help.ts` | 方括号与「可选」标注 |
| `ops/src/domain/runtime-plan.ts` | `DATA_MODES` 加 prod、`databasePath`、组合校验 |
| `ops/src/interface/registry.ts` | 注册 `--database-path`、示例文案 |
| `ops/src/application/runtime.ts` | prod spawn `--data-database-path` |
| `ops/src/interface/cli.ts` | 捕获 `OpsError('USAGE')` 走 10 |
| 测试 | value-parser / parser / commands / help / cli / runtime / runtime.stack |

测试场景:path 合法与空串/换行;optional 缺失通过、重复报错、switch/位置参数不得 optional;两个非法组合与一个合法组合的退出码与输出;prod spawn 参数;test 注入不变。

## 3. 工作块 B:服务器部署(技术方案)

### 3.1 构建与产物

- 服务器架构:`uname -m` → `x86_64-unknown-linux-musl` 或 `aarch64-unknown-linux-musl`;
- Rust 交叉编译(2026-09-26 已验证):`rustup target add <target>`(USTC 镜像加速),工具走 `nix shell nixpkgs#zig nixpkgs#cargo-zigbuild`,在 `src/` 下用 rustup 工具链的 cargo 执行 `cargo zigbuild --release --locked --target <target>`(nix 的 cargo 没有 musl std;brew 因 Xcode 许可不可用);x86_64/aarch64 两个 target 均产出静态链接 ELF;
- 依赖风险已核实:Product/Data 无 openssl/native-tls(`ureq` 用 rustls,SQLite 为 bundled `libsqlite3-sys`),musl 交叉编译可行;ring/libsqlite C 代码由 zig 的 cc 处理;
- 前端:平台无关,在 flake 环境(`direnv allow` 或 `nix develop ./nix`)里 `pnpm -C src/frontend run build` 或 `ops delivery build`;注意 `ops delivery build` 产出的 Rust binary 是 mac 本地格式,**服务器二进制必须来自 zigbuild**;
- 备选:若 zigbuild 首次失败,Docker/colima 容器内构建并拷出(musl 基础镜像)。

产物与落位:

| 产物 | 服务器路径 | 属主/权限 |
| --- | --- | --- |
| `product` / `data` / `blog-admin-credentials` | `/usr/local/bin/` | root:root 0755 |
| `src/frontend/dist/` 整目录 | `/var/lib/blog/web/dist/` | blog:blog 0755/0644 |
| `blog.db` | `/var/lib/blog/blog.db` | 首次启动由 data 创建 |
| `credentials.env` + TOTP/恢复码状态 | `/var/lib/blog/admin-auth/` | 工具创建 0700/0600 |
| `product.env`(token) | `/var/lib/blog/product.env` | root:root 0600 |
| 阿里云证书 | `/etc/blog/<serverName>.pem` 与 `.key`(事实源)→ `/etc/nginx/cert/`(安装器复制) | key 0600 |

### 3.2 服务器基础准备(目标系统:Ubuntu 24.04,重置后)

Ubuntu 24.04 适配结论:无阻塞。musl 静态 binary 不依赖系统 glibc;systemd 255 支持本方案全部 unit 指令;apt 自带 nginx 1.24 满足 TLS1.2/1.3 反代配置;SQLite 已编入 data binary,服务器不需要装 sqlite3;systemd-timesyncd 默认启用,时钟漂移风险低。

1. `apt update && apt install -y nginx`;确认 80/443 对公网开放:云服务器安全组放行,若启用了 ufw 则 `ufw allow 80,443/tcp`;
2. 禁用发行版默认站点(避免 80 default_server 抢请求):`rm -f /etc/nginx/sites-enabled/default`;博客配置放 `/etc/nginx/sites-available/blog.conf` 并软链到 sites-enabled;
3. 建系统用户:`useradd --system --home-dir /var/lib/blog --shell /usr/sbin/nologin blog`;
4. 建目录:`mkdir -p /var/lib/blog/web/dist` 并 `chown -R blog:blog /var/lib/blog`;
5. 上传产物:先传到 `/tmp`,再 `install` 到目标位置(避免中途半包);rsync 未装也能用 scp;
6. 检查时间同步:`timedatectl`(默认 systemd-timesyncd 应处于 active);提交 commit 的时间戳来自服务器时钟,漂移会让历史时间异常。

### 3.3 systemd 设计

`blog-data.service`(先起):

```ini
[Unit]
Description=Blog Data Server (SQLite)
After=network.target

[Service]
ExecStart=/usr/local/bin/data --listen 127.0.0.1:17801 --data-semantics prod --data-database-path /var/lib/blog/blog.db
Restart=on-failure
User=blog
Group=blog
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/blog

[Install]
WantedBy=multi-user.target
```

`blog-product.service`:

```ini
[Unit]
Description=Blog Product API (public pages + /api)
Wants=blog-data.service
After=network.target blog-data.service

[Service]
ExecStart=/usr/local/bin/product --listen 127.0.0.1:17800 --data-addr http://127.0.0.1:17801 --web-dir /var/lib/blog/web/dist --content-source github --admin off
Environment=BLOG_TRUSTED_PROXY_IPS=127.0.0.1
Environment=BLOG_CONTENT_REPO={{contentRepo}}
EnvironmentFile=-/var/lib/blog/product.env
Restart=on-failure
User=blog
Group=blog
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

设计要点:

- 仓库与发布包中的 unit/nginx 是模板(`deploy/systemd/`、`deploy/nginx/blog.conf`),`{{contentRepo}}`/`{{serverName}}` 由安装器 `blog-deploy.mjs` 读取 `/etc/blog/blog.json` 在服务器注入;发布包环境无关、不含个人标识;
- `--admin off`(决策点 8):公网不提供管理面,`/admin/*`、`/api/admin/*` 一律 404,不读取管理凭证,服务器不需要 `admin-auth` 目录;
- `--content-source github` 必须显式传:Product 默认是 `fixture`(src/backend/product/src/cli.rs:132),漏掉会完全不读内容仓库;
- 用 `Wants=` 而不是 `Requires=`:`Requires` 会让 `systemctl stop blog-data` 连带停掉 Product,和验收"data 停机时页面报错明确、恢复后自愈"矛盾;`Wants+After` 只保证启动顺序,不传播停止;
- 内部端口 17800/17801(2026-09-26 决策):避开 8080/8081 等常见端口与 Linux 临时端口段(32768–60999);外部只开 80/443;四处端口配置(Data `--listen`、Product `--listen`/`--data-addr`、nginx `proxy_pass`)保持一致;
- 启动时 Data 暂时不可用:Product 仍能起(last-good 快照读取、启动同步失败记录在案),不阻塞;
- 配置注入表:

| 配置 | 来源 | 说明 |
| --- | --- | --- |
| `BLOG_CONTENT_TOKEN` | `product.env` | GitHub 细粒度 PAT(仅该仓库 Contents + Pull requests 读写) |
| `BLOG_CONTENT_REPO` | unit `Environment=` | 非机密 |
| `BLOG_TRUSTED_PROXY_IPS` | unit `Environment=` | 只配 `127.0.0.1` |
| admin 三键(`BLOG_ADMIN_*`) | 本地编辑栈专用 | 服务器 `--admin off` 不读取;`--admin on` 的本地栈由 ops/环境注入 |

### 3.4 nginx 与 TLS

- 全新 server 块:80 把 `{{serverName}}` 与 `{{apexName}}`(www 前缀派生)301 到 `https://{{serverName}}`;443 `ssl_protocols TLSv1.2 TLSv1.3`,证书取 `/etc/nginx/cert/<serverName>.{pem,key}`(阿里云证书主体为 `www.ventusvocatflumen.cn`);
- `location /admin { return 404; }`、`location /api/admin/ { return 404; }` 作为管理面的纵深防御(Product `--admin off` 本身已 404);
- `location /` 反代 `http://127.0.0.1:17800`,设置 `Host`、`X-Forwarded-For $remote_addr`、`X-Forwarded-Proto https`;
- 证书事实源在 `/etc/blog/<serverName>.pem|.key`;安装器复制到 `/etc/nginx/cert/`(AppArmor 下 nginx 只允许惯例目录),更新证书=替换事实源后重跑 `redeploy`;
- Product 的路由约定:`GET /healthz`(健康检查)、`/api/public/*`(公开数据)、`/product/diagnostics`(注入配置与 Data 调用计数),静态页面由 fallback 提供。

### 3.5 从空服务器到可用的执行顺序

1. (一次性,用户)重置服务器:加 SSH 公钥、云安全组放行 80/443、域名解析指向服务器;装 `nodejs`,下载 `script-v*` 的 `blog-deploy.mjs` 到 `/etc/blog/`;
2. (服务器,用户)`node /etc/blog/blog-deploy.mjs init` → 填写 `/etc/blog/blog.json`(serverName/contentRepo/contentToken)+ 放证书 `/etc/blog/<serverName>.pem|.key`;
3. (开发机)按需打 tag:`script-v*` 出安装器、`build-v*` 出 x86_64 发布包(CI 自动;服务器为 x64,arm64 构建暂关,能力保留);
4. (服务器,用户)`node /etc/blog/blog-deploy.mjs deploy|redeploy`:自动下载最新 build-v* → 校验 SHA256SUMS → 注入域名/仓库名 → 安装产物/配置/证书/token → 重启 → 健康检查;
5. 走 B6 验收 + B5 恢复演练;更新版本重复 3~4 即可(redeploy 幂等)。

手工回退路径仍在计划 B1/B2/B3 节保留(unit/nginx 内容与安装位置不变)。

### 3.6 备份与恢复(GitHub 即备份)

- 内容真源是内容仓库;SQLite 只存公开快照、推荐位、下架墓碑等可重建/可重设状态;
- 恢复:停服务 → 删/移走 `blog.db` → 起 data(自动建库迁移)与 product → 启动同步从 `main` 重建 → 抽查公开端;
- 接受丢失:推荐位与下架墓碑(量小,手工重设);
- 上线前演练一次并留记录(计划 B5/B6)。

### 3.7 更新与回滚

- 更新:mac 重编译 → 传新二进制(dist 一并传)→ `systemctl restart blog-product`(data 一般不动;涉及迁移则重启 data 触发自动迁移)→ 验证 `/healthz` 与关键页面;
- 回滚:保留上一版二进制备份(如 `/usr/local/bin/backup/`)回拷 + 重启;若新迁移不向后兼容,把 `blog.db` 删掉从 `main` 重建(GitHub 即备份的直接收益);
- unit 变更:`daemon-reload` + `restart`;证书更新:`reload nginx`。

### 3.8 验收与排查命令

- 服务状态与日志:`systemctl status blog-data blog-product`、`journalctl -u blog-product -f`;
- 健康:`curl -s http://127.0.0.1:17800/healthz`;注入配置:`curl -s http://127.0.0.1:17800/product/diagnostics`;
- 公网:`curl -sI https://www.ventusvocatflumen.cn`(证书链、裸域 80 跳 www);
- 数据停机演练:`systemctl stop blog-data` → 页面/接口应明确报错(非挂死)→ `systemctl start blog-data` → 自愈。

## 4. 风险与待决

| 项 | 影响 | 应对 |
| --- | --- | --- |
| cargo-zigbuild 首次失败 | 阻塞构建 | Docker/colima 容器构建备选 |
| 服务器时钟漂移 | commit 时间戳异常 | 部署前确认 NTP |
| 2C/2G 内存余量 | 运行稳定性 | 部署后看 RSS 与 diagnostics;current_thread 运行时 |
| 证书路径与权限 | TLS 不可用 | 事实源 /etc/blog/;安装器复制到 /etc/nginx/cert,key 0600 |
| 迁移不向后兼容 | 回滚需重建库 | 回滚前评估;必要时删库从 main 重建 |
| 无自动发布/CI | 每次手工步骤 | 本文 3.5/3.7 即操作手册;后续可另立计划 |
| 本地 `--admin bypass` 免密 | 本机浏览器可被 DNS rebinding 伪造管理写操作 | 用户已接受(2026-09-26 决策);该模式禁止用于公网,公网用 `--admin off` |
| Product 静态挂载帮助文案过时("not mounted in this batch") | 误导 | 已核实实现会挂载(src/backend/product/src/main.rs:167-177);文案后续清理 |

## 5. 关键决策(已拍板)

A 块:

1. `path` 接受相对路径与 `~`(shell 展开),ops 不解释路径;
2. 字段名 `optional: true`;
3. 组合校验放 `planMode` + cli 捕获 `OpsError('USAGE')` 出 10;
4. 错误文案中文。

B 块:

5. unit 修正:`--content-source github` 必传、`Requires` 改 `Wants`(与验收语义一致);
6. 公网只读(决策点 8):服务器 `--admin off` + nginx 404 兜底;本地编辑用 `bypass`(免密,接受 DNS rebinding 风险)或 `on`;
7. 更新/回滚策略(旧二进制备份 + DB 可重建);内容更新 = 合入后 SSH 重启 `blog-product`;
8. NTP、80/443 端口与防火墙前提。

## 6. 范围外

公开端分页、Mobile legacy CSS 下线、图片/RSS/SEO、DB 定期备份(已决策不做)、自动部署/CI、监控告警、服务器装 Nix/ops。

## 7. 交付物

- 仓库内:ops 代码变更与测试、`SPEC-OPS-PARAMETERS-001` 修订、`deploy/`(unit/nginx 模板、README)、安装器 `ops/src/installer/`、`.github/workflows/script-release.yml` 与 `build-release.yml`、计划/方案文档状态更新;
- 服务器上:`/etc/blog/`(blog-deploy.mjs、blog.json、证书)、两个 unit、nginx 配置、`/var/lib/blog/product.env`(派生)、二进制与 dist;服务器无管理凭证、无 release token;
- 证据:质量检查输出、A3 手工验收记录、B6 验收与恢复演练记录。
