# PLAN-PUBLIC-DEPLOY-001 博客公网上线

- 状态:进行中(2026-09-26;A 块与公网只读模式已实现并实测,质量门禁三处既有失败见 A3;B 块待用户准备服务器/证书/PAT)
- 目标:博客以 HTTPS 公网可用,服务器重启自动恢复,文章数据有备份。
- 读者:执行本计划的实现者(人或 agent)。本文件自包含,按节执行;标注「已核实」的事实均给出文件与行号,执行前可复核。
- 范围:工作块 A(ops 放行 `prod` 数据模式)+ 工作块 B(服务器部署)。
- 范围外(不阻塞发布):公开端分页、Mobile legacy CSS 下线、图片/RSS/SEO。

## 既定决策与红线(执行者必读)

- 域名 `ventusvocatflumen.cn`。服务器将整体重置(2026-09-26 决定):既有服务、配置与数据全部清空,不保留、不回退;nginx 与证书按全新部署处理。证书用阿里云证书,由用户手动上传到用户目录(仓库外,唯一事实源);nginx 引用惯例位置 `/etc/nginx/cert/`(部署时复制,root:root 0600)。
- 正式内容仓库已定(2026-09-26):GitHub 私有仓库 `nyml2003/blog-content`,专存文章内容,与代码仓库分离;该仓库由用户自行创建(B4 前置)。
- TLS 必须先于/同时上线:应用层鉴权不含链路加密,明文公网会泄露 session cookie(SPEC-ADMIN-AUTH-001)。
- `BLOG_TRUSTED_PROXY_IPS` 只配 `127.0.0.1`(nginx 同机),不得配宽泛网段(operations.md)。
- prod 数据库路径无默认值,缺路径拒绝启动是既定契约,不为部署便利放宽(architecture/backend.md)。
- 管理凭证目录权限 0700、文件 0600 由工具保证,不手工编辑、复制或放宽(operations.md)。
- `BLOG_CONTENT_TOKEN`、凭证文件内容不进本仓库、不进 unit 明文。
- 备份采用「GitHub 即备份」(2026-09-26 决策):内容真源是私有内容仓库,SQLite 是可重建的运行缓存,不做定期 DB 备份;推荐位与下架墓碑随 DB 丢失属接受行为(见 B5)。

---

## 工作块 A:ops 放行 prod 数据模式

### A0 现状(已核实)

- Data binary 已完整支持 prod:`data --listen <IP:PORT> --data-semantics mock|test|prod --data-database-path <PATH>`;prod 缺路径拒绝启动(退出码 10);prod 自动迁移、不加载 seed、退出不删除(`src/backend/data/src/cli.rs:6-10`、`src/backend/data/src/semantics.rs:6`)。**本工作块不改 Rust 代码。**
- ops 白名单未放行:`ops/src/domain/runtime-plan.ts:6` `export const DATA_MODES = ['mock', 'test'] as const;`
- `--data` 参数注册直接引用该常量:`ops/src/interface/registry.ts:111` `model: { kind: 'enum', values: DATA_MODES }`;backend 模式的帮助示例(registry.ts:109)已出现 `--data prod`,与实现不一致,改完即一致。
- ops spawn Data 的参数拼装:`ops/src/application/runtime.ts:253-255`,当前仅 test 语义注入数据库路径(经环境变量 `BLOG_DATABASE_PATH`)。
- 参数框架与 Spec 约束(2026-09-26 核实):有值模型只有 `int32`、`enum`,没有字符串/路径类型;所有有值参数一律必填(`ops/src/interface/parser.ts:52-57`);元数据只允许 name/description/model,且禁止自定义校验钩子(`SPEC-OPS-PARAMETERS-001:15,19,33`)。因此 `--database-path` 必须先修订该 Spec 并扩展框架:**新增 `path` 值模型 + `optional` 可选参数 + 组合校验**;用户已批准(2026-09-26)。
- ops 会清除所有 ambient `BLOG_*` 环境变量(operations.md:50),因此 prod 路径必须走显式 CLI 参数,不能靠环境透传。
- `integration` 模式固定 `test`(runtime-plan.ts:117),本期不动;`--database-path` 只在 backend 模式注册。

### A1 实施方案(单独文档,待评审)

详细设计见 [`PLAN-PUBLIC-DEPLOY-001-TECH.md`](./PLAN-PUBLIC-DEPLOY-001-TECH.md) 第 2 节(草案,2026-09-26):修订 SPEC-OPS-PARAMETERS-001(新增 `path` 值模型与 `optional` 可选参数)→ 扩参数框架 → 领域注册 `prod` 与组合校验 → cli 补退出码 10 通道 → 三层测试。预计半天,不改 Rust。

不要为绕开校验把 `--database-path` 做成全局必填(会破坏 mock/test 用法)。

### A2 测试要求

- 框架(`ops/src/interface/value-parser.test.ts`、`parser.test.ts`、`ops/src/domain/commands.test.ts`、`help.test.ts`):path 合法/空串/换行;optional 缺失不报错、出现即校验、重复仍报错;switch 与位置参数不得 optional;help 出现 `[--database-path <path>]` 与「可选」标注;声明不可变。
- 命令(`ops/src/application/runtime.test.ts`、`ops/src/interface/cli.test.ts`):prod 缺路径报 10;test/mock 带路径报 10;合法组合通过;错误输出含修正提示且零副作用。
- spawn 参数断言(`ops/src/application/runtime.stack.test.ts`):prod 模式 data 进程参数含 `--data-database-path <PATH>`;test 路径注入行为不变。
- 帮助文案测试(`ops/src/interface/help.test.ts`)如有快照需同步。

### A3 验收(执行记录 2026-09-26)

- [x] 参数行为:`ops runtime backend --content-source fixture --data prod --product-port 18080 --data-port 18081` 实测退出码 10,stderr 报「--data prod 必须显式提供 --database-path」,stdout 输出帮助;
- [x] prod 起栈、重启数据仍在:真实进程 E2E `MODE-PROD` 通过(显式路径建库、自动迁移、不 seed、退出不删、重开同库可读),等同原验收 3+4;
- [x] integration 行为不变:真实进程 E2E `MODE-004` 通过(固定 test、挂载 web/dist);
- [x] ops 契约测试与静态检查:123 例(110 通过、13 个默认跳过的真实进程用例);ops 语法检查全过;pnpm typecheck/lint/format/build 全过;
- [ ] `ops quality check` 未全绿,三处既有失败与本次改动无关:(a) `scripts/test-article-html-wasm.mjs:14` 引用的 `docs/plans/archive/PLAN-ARTICLE-HTML-VALIDATION-001/fixtures/article-html-v1.json` 已随 plans 目录移除;(b) `src/frontend/app/kernel/ports/index.ts` 触发 kernel 架构边界(最后修改 3fb7b6b,本次未动);(c) `src/backend/product/src/http.rs:2015` 既有 `clippy::collapsible_match`(本次 diff 未触碰该表达式);
- [x] ops 类型校验:ops 不在项目 tsc 门禁内;单独用 tsc 7.0.2 strict 校验,本次改动文件 0 错误(全仓 ops 另有 22 条历史遗留错误,不在本期范围);
- 备注:wasm-bindgen 生成产物(`src/frontend/common/validation/generated/`)已按用户要求移出 git 跟踪并加入 .gitignore(2026-09-26),构建流程会自动重新生成。
- 主控复核(2026-09-26):单元/契约测试复跑全绿(63 例,0 失败);E2E 档(`OPS_RUNTIME_E2E=1`)复跑 **MODE-PROD 通过**,核心验收属实。同档另有 3 个失败用例(`MODE-001`/`PORT-002+ENV-001` dev+Vite 链路 60s 超时 ×2、`FAIL-003` missing-binary stdout 断言 ×1),均不在 A 块改动面(prod/backend 用例全过),待归因;不阻塞部署,可与 quality check 两处既有失败一并处置。

---

## 工作块 B:服务器部署

> 本工作块无代码开发,全部是构建、部署与验收操作;唯一入库产物是 systemd unit 文件(建议 `deploy/systemd/`,见 B1)。技术细节见 [`PLAN-PUBLIC-DEPLOY-001-TECH.md`](./PLAN-PUBLIC-DEPLOY-001-TECH.md) 第 3 节。
> **前置:先完成本地生产彩排 [PLAN-LOCAL-REHEARSAL-001](./PLAN-LOCAL-REHEARSAL-001.md)(2026-09-26 拆出独立 plan),其发现的阻塞性问题回写本 plan。**

### B0 部署物与目标环境

- 目标环境:Ubuntu 24.04,2C/2G/40G(FACT-RUNTIME-001);服务器不装 Nix,纯 binary + systemd。
- 服务器基础准备(重置后、部署前):安装 nginx;创建系统用户 `blog`;创建 `/var/lib/blog/web/dist` 并从开发机上传前端 dist 与二进制(见下表);证书按决策点 6 上传。`admin-auth` 目录由凭证工具自行创建(0700),无需预建。
- **构建方案已定(2026-09-26):macOS 交叉编译**。前端 `dist` 为纯静态文件,与平台无关;Rust binary 用 musl 静态链接(不依赖服务器 glibc 版本):
  1. 服务器 `uname -m` 定 target:`x86_64` → `x86_64-unknown-linux-musl`;`aarch64` → `aarch64-unknown-linux-musl`;
  2. mac 准备(2026-09-26 实测):`rustup target add <target>`(直连 rust-lang 很慢,用镜像 `RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static`);
  3. 交叉工具走 nix、不装全局:`nix shell nixpkgs#zig nixpkgs#cargo-zigbuild -c sh -c 'export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"; cd src && cargo zigbuild --release --locked --target <target>'`;必须用 rustup 工具链的 cargo(nix 的 cargo 没有 musl std),内部 cargo-zigbuild/zig 由 nix shell 提供;brew 路径因本机未接受 Xcode 许可而不可用;
  4. 前端在 mac 上直接构建(与平台无关):`ops delivery build --dry-run` 核对步骤后执行,或单独 `pnpm -C src/frontend run build`,产物 `src/frontend/dist/`;
  5. 备选(若 zigbuild 不可行):Docker/colima 容器内构建。
- 构建冒烟结果(2026-09-26):两个 target 的 product/data/blog-admin-credentials 均产出静态链接 ELF(`file` 验证),产物在 `src/target/<target>/release/`。
- 传输清单与落位(产物目录 `src/target/<target>/release/`,target 见上):

```text
src/target/<target>/release/product      → /usr/local/bin/product
src/target/<target>/release/data         → /usr/local/bin/data
src/target/<target>/release/blog-admin-credentials → /usr/local/bin/blog-admin-credentials
src/frontend/dist/(整目录)                → /var/lib/blog/web/dist/
(数据库)                                   → /var/lib/blog/blog.db(启动自动创建+迁移,无需预置)
(凭证)                                     → /var/lib/blog/admin-auth/(B5 生成)
```

### B1 systemd unit(已落位 `deploy/systemd/`,2026-09-26 入库)

`/etc/systemd/system/blog-data.service`:

```ini
[Unit]
Description=Blog Data Server (SQLite)
After=network.target

[Service]
ExecStart=/usr/local/bin/data --listen 127.0.0.1:17801 --data-semantics prod --data-database-path /var/lib/blog/blog.db
Restart=on-failure
User=blog
Group=blog
# 加固(按服务器实际情况可调)
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/blog

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/blog-product.service`:

```ini
[Unit]
Description=Blog Product API (public pages + /api)
Wants=blog-data.service
After=network.target blog-data.service

[Service]
ExecStart=/usr/local/bin/product --listen 127.0.0.1:17800 --data-addr http://127.0.0.1:17801 --web-dir /var/lib/blog/web/dist --content-source github --admin off
Environment=BLOG_TRUSTED_PROXY_IPS=127.0.0.1
Environment=BLOG_CONTENT_REPO=nyml2003/blog-content
EnvironmentFile=/var/lib/blog/product.env
Restart=on-failure
User=blog
Group=blog
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

说明:
- 内部端口已定(决策点 7):Product `17800`、Data `17801`(均回环);Data `--listen`、Product `--listen`/`--data-addr`、nginx `proxy_pass` 四处保持一致。
- unit 两处修正(2026-09-26 评审,详见 TECH 文档 3.3):`--content-source github` 必传(Product 默认 fixture,漏传不读内容仓库,`src/backend/product/src/cli.rs:132`);`Requires` 改 `Wants`,否则 `systemctl stop blog-data` 会连带停掉 Product,和 B6「data 停机时页面报错明确、恢复后自愈」矛盾。
- 公网只读(决策点 8,2026-09-26):unit 用 `--admin off`,管理面 `/admin/*`、`/api/admin/*` 一律 404,不读取凭证;服务器不再需要 `admin-auth` 目录与凭证文件,`ReadWritePaths` 相应移除;管理只存在于本地编辑栈。
- `BLOG_CONTENT_TOKEN` 放独立文件 `/var/lib/blog/product.env`(root:root 0600,唯一内容 `BLOG_CONTENT_TOKEN=<token>`),由 unit `EnvironmentFile=` 加载;该文件不入仓库、不进 unit 明文。
- Product 对 Data 短暂不可用的行为:GitHub 同步失败走 last-good 快照、公开读取继续(operations.md:51);Data 停机时 Product 请求失败——验收 B6 覆盖。

### B2 nginx 配置(服务器重置后全新部署)

服务器重置后无既有站点,全新写入 80 跳转 + 443 反代:

```nginx
server {
    listen 80;
    server_name ventusvocatflumen.cn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ventusvocatflumen.cn;
    ssl_certificate     /etc/nginx/cert/ventusvocatflumen.cn.pem;
    ssl_certificate_key /etc/nginx/cert/ventusvocatflumen.cn.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # 公网只读:管理面在 Product(--admin off)已是 404,这里再加一层兜底
    location /admin { return 404; }
    location /api/admin/ { return 404; }

    # 页面与 /api 同源,均由 Product(127.0.0.1:17800)提供
    location / {
        proxy_pass http://127.0.0.1:17800;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

- 目标系统 Ubuntu 24.04:`rm -f /etc/nginx/sites-enabled/default`(避免默认站点抢 80),配置落 `/etc/nginx/sites-available/blog.conf` 并软链;云安全组放行 80/443,启用 ufw 时 `ufw allow 80,443/tcp`;
- 证书事实源在用户上传的用户目录(阿里云证书),部署时用 `install -m 600` 复制到 `/etc/nginx/cert/`,nginx 只引用这个惯例位置;证书更新后重新复制并 `reload nginx`(决策点 6);
- `nginx -t` 通过后 `systemctl reload nginx`;
- 前置条件核对:Product 仅在 socket peer 命中 `BLOG_TRUSTED_PROXY_IPS`、`X-Forwarded-For` 为单一合法 IP、`X-Forwarded-Proto` 为 http/https 时采用转发信息(operations.md:66),上述配置与之匹配(nginx 与 Product 同机,peer 即 127.0.0.1)。

### B3 管理凭证(已废弃:公网只读,决策点 8)

服务器不提供管理面,不再初始化管理凭证;`admin-auth` 目录与 `credentials.env` 只属于本地编辑栈:`--admin on` 时在 mac 上按原流程初始化,`--admin bypass` 时不需要任何凭证。原服务器初始化命令与 0700/0600 权限约束仅保留给本地(见 `blog-admin-credentials --help`)。

### B4 内容仓库初始化(开发机执行)

前置:用户在 GitHub 创建私有仓库 `nyml2003/blog-content`(空仓库,不勾 README 即可)。

```sh
BLOG_CONTENT_REPO=nyml2003/blog-content BLOG_CONTENT_TOKEN=<token> ops content repository init
```

- 幂等:对合法空仓库重复执行成功;创建空 `taxonomy.json` 与 `main`,不建样例文章(registry.ts:80-84);
- token 用细粒度 PAT(仅授权该仓库)。
- 执行记录(2026-09-26):仓库已存在且 `main` 已初始化(commit 9054323「Initialize empty blog content repository」),无需再跑 init;已从分支 `feature/2026-09-26-initial-articles` 经 [PR #1](https://github.com/nyml2003/blog-content/pull/1) 合入 3 篇初始文章,本地以 `--content-source github` 起栈验证:合入前公开端 0 篇、合入后 3 篇(文章类型「项目实践」),启动同步无失败。

### B5 备份与恢复(GitHub 即备份,2026-09-26 定)

内容以 GitHub 内容仓库为真源:每次改动走后台编辑 → 提交 PR → 用户合入 `main`(`docs/content-repo/CONTRACT.md`)。服务器不保留 DB 备份、不装 sqlite3、无 cron;数据库只是可重建的运行缓存。

- 恢复方式:清空或丢失 `/var/lib/blog/blog.db` 后启动 Product,从 `main` 同步重建公开快照;`main` 中存在的文章与分类恢复,推荐位与下架墓碑丢失(2026-09-26 决定接受,量小可手工重设);
- 上线前演练一次并记录证据:停 product/data → 删 `blog.db` → 起 data/product → 同步成功 → 抽查文章/分类可读、推荐位为空属预期;
- 未提交工作区草稿本来就允许重启清空,不算备份对象(`SPEC-CONTENT-GITHUB-TRUTH-001:27`);
- `docs/architecture/infrastructure.md:32` 已同步修订为不做定期 DB 备份(2026-09-26)。

### B6 上线验收清单

- [ ] `https://ventusvocatflumen.cn` 公开端(Desktop + Mobile)打开正常,无页面错误;
- [ ] 公网管理面不存在:`https://ventusvocatflumen.cn/admin`、`/admin/login.html`、`/api/admin/*` 全部 404;公开端只读;
- [ ] 本地编辑闭环(在 mac 上,`--admin bypass` 或 `on`):新建/编辑文章 → 提交 PR → GitHub 合入 → SSH 执行 `systemctl restart blog-product` → 公网可见新内容;未合入 PR 的内容不可见;
- [ ] `systemctl restart blog-product` 或整机 reboot 后两服务自动恢复;
- [ ] `systemctl stop blog-data` 后页面/接口报错明确(不 500 挂死),恢复 data 后服务自愈;
- [ ] 恢复演练按 B5 执行成功:清空 DB 后从 main 重建,抽查文章、分类可读,推荐位为空属预期;
- [ ] HTTP(80)访问自动跳转 HTTPS;证书链有效。

---

## 决策点(2026-09-26 已全部拍板)

1. **正式内容仓库名**:**已定(2026-09-26)`nyml2003/blog-content`**(私有,新建;专门存文章内容,与代码仓库分离);仓库由用户创建(B4 前置)。
2. **构建机**:~~待定~~ **已定(2026-09-26):macOS 交叉编译(cargo-zigbuild + musl,见 B0)**;
3. **备份方式**:**已定(2026-09-26):GitHub 即备份**。内容仓库为真源,不做定期 DB 备份;接受推荐位/下架墓碑随 DB 丢失,恢复=清空后从 `main` 重建(见 B5);
4. **服务器运行方式**:**已定(2026-09-26):不装 Nix/ops**,只放编译好的 binary + systemd;SQLite 负责实时交互与缓存,持久内容以 GitHub 内容仓库为准;
5. **既有服务处置**:**已定(2026-09-26):服务器整体重置**,彻底清空、不留老数据;nginx 与证书全新部署,不需要回退方案;
6. **证书来源**:**已定(2026-09-26):阿里云证书**。用户手动上传到用户目录(仓库外,唯一事实源,以上传位置为准);nginx 引用惯例位置 `/etc/nginx/cert/`,部署时复制过去(root:root 0600)。
7. **内部端口**:**已定(2026-09-26):Product `127.0.0.1:17800`、Data `127.0.0.1:17801`**。避开 8080/8081 与 Linux 临时端口段(32768–60999);外部仍只有 80/443,unit 与 nginx 已同步。
8. **公网面形态**:**已定(2026-09-26):公网只读 + 本地编辑**。Product 新增 `--admin <on|off|bypass>`(默认 `on`):服务器 unit 用 `off`,管理面 404、无凭证;本地编辑栈用 `bypass` 免密(接受本地 DNS rebinding 风险),或 `on` 走密码+TOTP;内容更新流程 = 本地提交 PR → 合入 → SSH `systemctl restart blog-product` 触发启动同步。Spec 与部署配置已同步(commit 记录见收尾)。

## 已核实事实索引

| 事实 | 位置 |
| --- | --- |
| `DATA_MODES` 白名单 | ops/src/domain/runtime-plan.ts:6 |
| `--data` 参数枚举引用 DATA_MODES | ops/src/interface/registry.ts:111 |
| backend 帮助示例已含 `--data prod` | ops/src/interface/registry.ts:109 |
| spawn data 参数拼装、test 路径注入 | ops/src/application/runtime.ts:253-255 |
| integration 固定 test | ops/src/domain/runtime-plan.ts:117 |
| Data CLI 契约(prod 无路径拒绝启动) | src/backend/data/src/cli.rs:6-10,75,135-140 |
| prod 语义(自动迁移/不 seed/不删) | src/backend/data/src/semantics.rs:6,25,118 |
| Product CLI(--listen/--data-addr/--web-dir) | src/backend/product/src/cli.rs:5-15 |
| 凭证三环境变量 | src/backend/product/src/auth/config.rs:4-7 |
| 凭证工具用法 | src/backend/product/src/bin/blog-admin-credentials.rs:37,43 |
| 凭证 env 文件名与三键 | src/backend/product/src/bin/blog-admin-credentials.rs:16,127-129 |
| 凭证文件已存在时拒绝覆盖 | src/backend/product/src/bin/blog-admin-credentials.rs:120-122 |
| delivery build = cargo build --release | ops/src/application/runtime.ts(BuildStep) |
| 内容仓库 init 幂等语义 | ops/src/interface/registry.ts:80-84 |
| 可信代理判定规则 | docs/guides/operations.md:66 |
| 内容仓库为真源、发布由 main 决定 | docs/content-repo/CONTRACT.md:9-11 |
| 推荐状态与文章墓碑存于 SQLite | docs/content-repo/CONTRACT.md:66-69,78-79 |
| 工作区草稿允许重启清空 | docs/specs/archive/SPEC-CONTENT-GITHUB-TRUTH-001.md:27 |
| 备份决策:GitHub 即备份,架构文档已同步修订 | docs/architecture/infrastructure.md:32(2026-09-26) |
| 参数模型仅 int32/enum/switch、有值参数必填 | ops/src/domain/parameters.ts:4-7、ops/src/interface/parser.ts:52-57 |
| Spec 明确不实现 string/path、禁止自定义钩子 | docs/specs/SPEC-OPS-PARAMETERS-001.md:15,19,33 |
| ops 缺失组合校验的 10 退出通道需在 cli 层补 | ops/src/interface/cli.ts:172,186-188 |
| Product 内容源默认 fixture,必须显式传 github | src/backend/product/src/cli.rs:132,112-123 |
| Product 会挂载 --web-dir 静态文件(fallback) | src/backend/product/src/main.rs:167-177 |
| 健康路由为 GET /healthz | src/backend/product/src/cli.rs:227 |
| Product 管理面模式 `--admin on|off|bypass` | src/backend/product/src/cli.rs(AdminMode)、http.rs(admin_auth_gate) |

## 收尾要求(按 AGENTS.md)

结束时记录:实际交付、未交付内容、已有证据(命令与结果)、停止或替代原因、恢复工作所需条件。状态可为 `completed` / `partial` / `parked` / `superseded`。
