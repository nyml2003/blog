# deploy

`ops delivery package|deploy|bundle` 的约定与用法。

## 日常发布(服务器操作由你执行)

```sh
# 1. 本机构建并打包(无秘密)
ops delivery package --config ~/.config/blog/deploy.json

# 2. 上传到服务器:发布包、证书、token 各就各位
scp -p deploy/dist/blog-release-*.tar.gz <host>:~/
scp -p <本机证书>/<域名>.pem <域名>.key <host>:~/cert/     # 服务器端约定目录
scp -p ~/.local/state/blog/product.env <host>:~/product.env

# 3. 服务器上解包并安装(幂等;重复执行即发新版本)
tar -xzf blog-release-*.tar.gz -C blog-release && cd blog-release && sudo bash install.sh
```

`install.sh` 会校验 `SHA256SUMS`、准备 nginx/blog 用户与目录、安装二进制与 dist、安装 unit 与 nginx 配置、从 `~/cert` 安装证书、把 `~/product.env` 装成 `/var/lib/blog/product.env`(0600),最后重启服务并做健康检查。可用 `CERT_DIR` / `TOKEN_FILE` 覆盖默认位置。

可选的 SSH 自动化:在 mac 上 `ops delivery deploy --config ...` 会代为完成上面的传输与安装;服务器操作习惯手工时不用它。

## 配置(放仓库外,建议 0600)

```json
{
  "host": "blog",
  "target": "x86_64-unknown-linux-musl",
  "serverName": "example.com",
  "contentRepo": "owner/blog-content"
}
```

| 字段 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `host` | 是 | - | SSH 目标,`~/.ssh/config` 别名或 `user@ip` |
| `port` | 否 | ssh 配置 | 显式 SSH 端口 |
| `target` | 是 | - | `x86_64-unknown-linux-musl` 或 `aarch64-unknown-linux-musl` |
| `serverName` | 是 | - | 域名,渲染 nginx 与证书文件名 |
| `contentRepo` | 是 | - | `owner/repo`,渲染进 Product unit |
| `tokenFile` | 否 | `~/.local/state/blog/product.env` | 本机 0600 token 文件 |
| `archiveRemoteDir` | 否 | `blog-releases` | 服务器上发布包目录(相对 `$HOME`) |
| `certSourceDir` | 否 | `cert` | 服务器上证书目录(相对 `$HOME`) |

## 秘密边界

- 仓库与发布包都不含 token、证书私钥、域名(模板占位符在打包时注入);
- token 只在部署时从本机 0600 文件经 `scp` → `install 0600` 传输,内容不进命令行、日志与输出;
- 证书私钥始终留在服务器 `~/cert/` 与 `/etc/nginx/cert/`;
- 发布包可安全落在服务器磁盘,默认保留最近 3 份便于回滚。

## 单文件脚本

`ops delivery bundle` 会把 ops CLI 打成 `deploy/dist/blog-deploy.mjs`(依赖 node 内置模块),复制到任意有 Node 的机器即可执行 `node blog-deploy.mjs delivery deploy --config ...`。
