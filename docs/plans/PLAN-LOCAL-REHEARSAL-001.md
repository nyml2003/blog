# PLAN-LOCAL-REHEARSAL-001 本地生产彩排

- 状态:进行中(2026-09-26 立项,自 PLAN-PUBLIC-DEPLOY-001 B0.5 拆出)
- 目标:在 mac 上以生产参数完整跑一遍部署物,提前暴露问题,让服务器部署(B 块)一次成功。
- 上游:[PLAN-PUBLIC-DEPLOY-001](./PLAN-PUBLIC-DEPLOY-001.md);本 plan 是其 B 块(服务器部署)的前置。彩排发现的阻塞性问题回写主 plan 或另立修复任务;非阻塞问题记录在本 plan 收尾。
- 读者:执行者(人或 agent)。构建产物路径、服务参数与主 plan B0/B1 一致(端口 17800/17801)。

## 范围

**能验的**:构建产物可用性、prod 数据库真实建库迁移、同源挂载页面、healthz/页面/API 链路、GitHub 内容同步、管理凭证加载。
**验不了的(留给主 plan B 块,服务器上验)**:systemd 自启/停机联动、nginx + 证书 + 公网链路。

## 第一档:无凭证 + fixture 内容(全自动,无前置)

1. 构建:mac 原生 `cargo build --release`(本地验证不需要交叉编译)+ `pnpm -C src/frontend run build`;
2. 起 Data(生产参数,路径换本地):`src/target/release/data --listen 127.0.0.1:17801 --data-semantics prod --data-database-path ~/.local/state/blog/rehearsal/blog.db`;
3. 起 Product:`src/target/release/product --listen 127.0.0.1:17800 --data-addr http://127.0.0.1:17801 --web-dir src/frontend/dist --content-source fixture`;
4. 验收:
   - [x] `curl http://127.0.0.1:17800/healthz` 正常(`src/backend/product/src/cli.rs:227`);
   - [x] 首页 HTML 返回(dist 挂载生效);
   - [x] 公开 API 可读(fixture 内容);
   - [x] `~/.local/state/blog/rehearsal/blog.db` 已创建且含迁移表;
   - [x] 重启两进程后数据仍在。

## 第二档:真凭证 + GitHub 内容(需用户前置)

> 2026-09-26 调整:公网部署改为只读(主 plan 决策点 8),管理只存在于本地;本地编辑可用 `--admin bypass` 免密。

1. 前置:仓库 `nyml2003/blog-content` 与 token 已就绪;`--admin on` 需要则本地跑 `blog-admin-credentials init --state-dir ~/.local/state/blog/admin-auth`(TTY 输密码,用户自己执行);`--admin bypass` 不需要凭证;
2. 起 Product 追加 env:`BLOG_CONTENT_REPO=nyml2003/blog-content`、`BLOG_CONTENT_TOKEN=<token>`,并加 `--admin bypass`(或 `on` + 凭证三键);
3. 验收:
   - [x] 启动同步 GitHub 成功(2026-09-26:合入后 3 篇文章);
   - [x] `--admin bypass` 下管理页面与管理 API 免登录可用(2026-09-26 实测);
   - [ ] 提交一篇文章 → 生成 PR → 合入 → 手动同步/重启同步 → 公开端可见(完整内容闭环,待执行);
   - [x] 公网形态 `--admin off`:`/admin/*`、`/api/admin/*` 404,公开面正常(2026-09-26 实测)。

## 执行记录
### 第一档(2026-09-26,已完成)

- 构建:mac 原生 `cargo build --release` + `pnpm -C src/frontend run build` 成功;
- 起栈:`src/target/release/data --listen 127.0.0.1:17801 --data-semantics prod --data-database-path ~/.local/state/blog/rehearsal/blog.db` 与 `src/target/release/product --listen 127.0.0.1:17800 --data-addr http://127.0.0.1:17801 --web-dir src/frontend/dist --content-source fixture`;
- 证据:healthz 200;首页 200 `text/html`,抽取的 `/assets/desktop-public-home-*.js` 200;公开 API `code=OK`(`total=0`,prod 不 seed 且 fixture 源不导入 Data,属预期);`blog.db` 创建,含 5 条 `_sqlx_migrations` 与全部业务表;重启后同 inode、迁移数不变、API 正常;
- 结论:无阻塞问题。第二档未执行(需用户 TTY 跑凭证初始化)。

## 约定

- 彩排产物(`~/.local/state/blog/rehearsal/`)在仓库外,演练后保留备查,不清理;
- 本 plan 不改源码;发现问题按主控裁决:阻塞项回写主 plan,其余记入本 plan 收尾;
- 凭证仅用于本地演练,与服务器正式凭证各自独立生成。

## 收尾要求(按 AGENTS.md)

结束时记录:实际交付、未交付内容、已有证据(命令与结果)、发现的问题及去向(阻塞/非阻塞)、恢复工作所需条件。状态可为 `completed` / `partial` / `parked` / `superseded`。
