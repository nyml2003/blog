# deploy

发布包由 CI(打 tag 触发)构建并挂到 GitHub Release;服务器上解包后 `install.sh` 完成安装。
发布包**环境无关**,不含域名、仓库名、token 或证书。

## 一次性配置(服务器)

```text
/etc/blog/deploy.env     0600  SERVER_NAME=<域名>
                               CONTENT_REPO=<owner>/<内容仓库>
/etc/blog/release.token  0600  代码仓只读 PAT(Contents: Read),用于下载 Release 资产
~/cert/<域名>.pem|.key         阿里云证书(事实源)
~/product.env            0600  内容仓库 token(BLOG_CONTENT_TOKEN=...)
```

## 发版

```sh
git tag v0.1.0 && git push origin v0.1.0
```

CI 构建 `x86_64` 与 `aarch64` 两个 musl 资产并挂到 Release。也可在 Actions 页手动触发(只出 workflow artifact,不发 Release)。

## 服务器更新(幂等;重复执行即发新版本)

```sh
TOKEN=$(sudo cat /etc/blog/release.token)
curl -fL -H "Authorization: Bearer $TOKEN" -o blog-release.tar.gz \
  "https://github.com/<owner>/<repo>/releases/download/v0.1.0/blog-release-<target>-<stamp>.tar.gz"
tar -xzf blog-release.tar.gz -C blog-release
cd blog-release && sudo bash install.sh
```

`install.sh`:校验 `SHA256SUMS` → 读 `/etc/blog/deploy.env` → `sed` 渲染 unit/nginx 模板 → 安装二进制/dist/配置 → 从 `~/cert` 装证书、从 `~/product.env` 装 token(0600)→ 重启并健康检查。可用 `DEPLOY_ENV_FILE` / `CERT_DIR` / `TOKEN_FILE` 覆盖默认位置。

## 本地构建(可选)

```sh
ops delivery package --target x86_64-unknown-linux-musl   # 产物在 deploy/dist/(已 gitignore)
ops delivery bundle                                      # ops CLI 单文件 JS,任意有 Node 的机器可跑
```

## 秘密边界

- 仓库与发布包都不含 token、证书、域名与仓库名;模板渲染在服务器安装时完成;
- `deploy.env`、`release.token`、`product.env`、证书都留在服务器 0600 文件里;
- 发布包带 `MANIFEST.json` 与 `SHA256SUMS`,安装前逐项校验。
