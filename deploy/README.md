# deploy

部署由两套 Release 资产驱动。代码仓公开:`script-v*` 只挂安装器 `blog-deploy.mjs`,`build-v*` 挂 x86_64 发布包 tarball(服务器为 x64;arm64 构建暂关,`ops delivery package --target` 能力保留);服务器配置集中在 `/etc/blog/`。

只想在个人机器上常驻跑一套(loopback,无域名/证书/nginx),见 [local/](./local/README.md)。

## 服务器一次性引导

```sh
apt-get install -y nodejs
curl -fLo /etc/blog/blog-deploy.mjs \
  https://github.com/nyml2003/blog/releases/download/script-v0.1.1/blog-deploy.mjs
node /etc/blog/blog-deploy.mjs init
# 编辑 /etc/blog/blog.json:serverName 填证书上的名字(如 www.example.com)、contentRepo、contentToken、buildTag 保持为 latest;
# 放证书 /etc/blog/<serverName>.pem 与 .key(0600)
node /etc/blog/blog-deploy.mjs deploy
```

说明:`serverName` 以证书主体为准(`www.` 前缀)。裸域名的 HTTP 会 301 到 `serverName`;HTTPS 裸域名需要包含 apex 的证书。

## 日常发版与服务器更新

```sh
# 发版(代码仓打 tag,CI 自动出资产)
git tag script-v0.1.1 && git push origin script-v0.1.1   # 安装器有改动时
git tag build-v0.1.1  && git push origin build-v0.1.1    # 二进制/页面有改动时

# 服务器更新(幂等,自动取最新 build-v*)
node /etc/blog/blog-deploy.mjs redeploy
# --dry-run 完成网络预检并输出预检报告,不下载、不安装、不重启;版本策略由 blog.json 的 buildTag=latest 控制
# 安装器自身更新(只替换安装器,不重启业务服务)
node /etc/blog/blog-deploy.mjs self-update --dry-run
node /etc/blog/blog-deploy.mjs self-update
# script-v* Release 必须同时提供 blog-deploy.mjs 与 SHA256SUMS;失败会自动恢复备份
```

## 网络预检与下载行为

`deploy` / `redeploy` / `self-update` 在下载或替换任何文件前执行统一网络预检,按层级检查:

1. DNS 解析 `api.github.com`;
2. TCP 443 连接;
3. TLS 握手(证书校验失败会明确报告);
4. Release API(解析最新稳定 tag);
5. 目标资产可达性(HEAD 优先,无 Content-Length 时回退 `Range: bytes=0-0`)。

- 预检失败立即终止,不创建安装文件、不重启服务,并给出建议动作(DNS/防火墙/CA 证书/限流等分别可诊断);
- 下载为流式写入(分档超时:响应头 30s、读体空闲 60s、总时限 10min),TTY 终端显示进度条(总量未知时显示字节与速度,不伪造百分比),非 TTY 输出周期性进度行;
- 仅对瞬断/超时/429/5xx 重试(最多 3 次,退避 1-8s),404、证书失败、checksum 不匹配不重试;
- 下载后强制 SHA256SUMS 校验,HTTP 200 不视为成功;任何阶段失败都会清理临时文件,旧安装器、旧业务包与配置保持原状;
- `--json` 输出 NDJSON 事件流(`release_resolved`、`network_preflight_*`、`download_*`、`checksum_*`、`install_started`、`healthcheck_completed`、`deployment_*`),stdout 不混入人类文本;失败使用稳定错误码(`PREFLIGHT_FAILED` / `DOWNLOAD_FAILED` / `CHECKSUM_MISMATCH`,附 `retryable` 判定),便于 CI 决定是否稍后重试。

## 离线安装(--package)

服务器无法访问 GitHub 资产域(国内云机器常见:API 可达但 release CDN 被限速或重置)时,在能访问 GitHub 的机器上下载发布包,scp 到服务器后离线安装:

```sh
# 本机
gh release download -R nyml2003/blog -p '*x86_64*.tar.gz' -O pkg.tar.gz   # 按服务器架构选 x86_64/aarch64
scp pkg.tar.gz root@<server>:/tmp/
# 服务器
node /etc/blog/blog-deploy.mjs redeploy --package /tmp/pkg.tar.gz
```

离线模式跳过网络预检与下载,但校验、安装、重启、健康检查与在线完全一致;校验基准是包内 SHA256SUMS(与在线模式相同)。下载通道的安全由你的本机 HTTPS 下载与 ssh 传输保证。

## 目录与权限

```text
/etc/blog/                     0700
  blog-deploy.mjs              单文件安装器(公开下载,无秘密)
  blog.json              0600  唯一配置:serverName / contentRepo / contentToken / buildTag
  <serverName>.pem       0644  证书(事实源)
  <serverName>.key       0600
派生(安装器管理,不手工编辑):
  /var/lib/blog/product.env    0600  内容 token
  /etc/nginx/cert/*            nginx 引用副本(安装时复制)
```

## 秘密边界

- 仓库与发布包不含 token、证书、域名与仓库名;模板占位符由安装器在服务器注入;
- 服务器唯一需要保管的是内容 token(`blog-content` 私有仓,Contents + Pull requests 读写);
- 下载全部来自公开仓,不需要 release token,也没有任何环境变量。
