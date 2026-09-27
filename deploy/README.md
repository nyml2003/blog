# deploy

部署由两套 Release 资产驱动。代码仓公开:`script-v*` 只挂安装器 `blog-deploy.mjs`,`build-v*` 挂 x86_64 发布包 tarball(服务器为 x64;arm64 构建暂关,`ops delivery package --target` 能力保留);服务器配置集中在 `/etc/blog/`。

## 服务器一次性引导

```sh
apt-get install -y nodejs
curl -fLo /etc/blog/blog-deploy.mjs \
  https://github.com/nyml2003/blog/releases/download/script-v0.1.0/blog-deploy.mjs
node /etc/blog/blog-deploy.mjs init
# 编辑 /etc/blog/blog.json(serverName / contentRepo / contentToken),
# 放证书 /etc/blog/<serverName>.pem 与 .key(0600)
node /etc/blog/blog-deploy.mjs deploy
```

## 日常发版与服务器更新

```sh
# 发版(代码仓打 tag,CI 自动出资产)
git tag script-v0.1.1 && git push origin script-v0.1.1   # 安装器有改动时
git tag build-v0.1.1  && git push origin build-v0.1.1    # 二进制/页面有改动时

# 服务器更新(幂等,自动取最新 build-v*)
node /etc/blog/blog-deploy.mjs redeploy
# 可选:--build-tag build-v0.1.1 固定版本;--dry-run 只看计划
# 安装器自身更新:重下 script-v* 的 mjs 覆盖 /etc/blog/blog-deploy.mjs
```

## 目录与权限

```text
/etc/blog/                     0700
  blog-deploy.mjs              单文件安装器(公开下载,无秘密)
  blog.json              0600  唯一配置:serverName / contentRepo / contentToken
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
