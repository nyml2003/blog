# deploy

`ops delivery package|deploy|bundle` 的约定与用法。

## 日常发布

```sh
# 1. 本机构建并打包(无秘密)
ops delivery package --config ~/.config/blog/deploy.json

# 2. 手动上传到服务器约定目录
scp deploy/dist/blog-release-*.tar.gz <host>:blog-releases/

# 3. 本机执行安装:准备环境、校验、替换产物、重启、健康检查
ops delivery deploy --config ~/.config/blog/deploy.json
```

步骤 3 是幂等的,重复执行等价于"发新版本":二进制、dist、unit、nginx 配置、证书、token 全部重新安装,服务最后统一重启。

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
