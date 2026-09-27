#!/usr/bin/env bash
# 服务器端安装脚本:由 ops delivery package 渲染进发布包,不含任何秘密。
# 用法:sudo bash install.sh
#   TOKEN_FILE=<本机 token 文件>  可选,默认找调用者家目录的 product.env
#   CERT_DIR=<证书目录>           可选,默认找调用者家目录的 cert/
set -euo pipefail

SERVER_NAME="{{serverName}}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_FILE="${TOKEN_FILE:-}"
CERT_DIR="${CERT_DIR:-}"

if [ "$(id -u)" != "0" ]; then
  echo "请以 root 运行:sudo bash install.sh" >&2
  exit 1
fi

INVOKER_HOME=""
if [ -n "${SUDO_USER:-}" ]; then
  INVOKER_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
fi

cd "$ROOT_DIR"
sha256sum -c SHA256SUMS

if ! command -v nginx >/dev/null 2>&1; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
fi

id -u blog >/dev/null 2>&1 || useradd --system --home-dir /var/lib/blog --shell /usr/sbin/nologin blog
install -d -o blog -g blog /var/lib/blog /var/lib/blog/web

install -m 0755 bin/product /usr/local/bin/product
install -m 0755 bin/data /usr/local/bin/data
install -m 0755 bin/blog-admin-credentials /usr/local/bin/blog-admin-credentials

rm -rf /var/lib/blog/web/dist
cp -a web/dist /var/lib/blog/web/dist
chown -R blog:blog /var/lib/blog/web

install -m 0644 systemd/blog-data.service /etc/systemd/system/blog-data.service
install -m 0644 systemd/blog-product.service /etc/systemd/system/blog-product.service
systemctl daemon-reload
systemctl enable blog-data.service blog-product.service

install -m 0644 nginx/blog.conf /etc/nginx/sites-available/blog.conf
ln -sfn /etc/nginx/sites-available/blog.conf /etc/nginx/sites-enabled/blog.conf
rm -f /etc/nginx/sites-enabled/default

if [ -z "$CERT_DIR" ] && [ -n "$INVOKER_HOME" ]; then
  CERT_DIR="$INVOKER_HOME/cert"
fi
if [ -z "$CERT_DIR" ]; then
  echo "无法确定证书目录,请用 CERT_DIR=<目录> 指定" >&2
  exit 1
fi
test -f "$CERT_DIR/$SERVER_NAME.pem" || { echo "缺少 $CERT_DIR/$SERVER_NAME.pem" >&2; exit 1; }
test -f "$CERT_DIR/$SERVER_NAME.key" || { echo "缺少 $CERT_DIR/$SERVER_NAME.key" >&2; exit 1; }
install -d -m 0755 /etc/nginx/cert
install -m 0644 "$CERT_DIR/$SERVER_NAME.pem" "/etc/nginx/cert/$SERVER_NAME.pem"
install -m 0600 "$CERT_DIR/$SERVER_NAME.key" "/etc/nginx/cert/$SERVER_NAME.key"

if [ -z "$TOKEN_FILE" ] && [ -n "$INVOKER_HOME" ] && [ -f "$INVOKER_HOME/product.env" ]; then
  TOKEN_FILE="$INVOKER_HOME/product.env"
fi
if [ -n "$TOKEN_FILE" ] && [ -f "$TOKEN_FILE" ]; then
  install -m 0600 -o root -g root "$TOKEN_FILE" /var/lib/blog/product.env
elif [ ! -f /var/lib/blog/product.env ]; then
  echo "警告:未提供 token(找不到 $INVOKER_HOME/product.env 或 TOKEN_FILE),GitHub 同步将不可用" >&2
fi

nginx -t
systemctl enable --now nginx
systemctl reload nginx || systemctl restart nginx

systemctl restart blog-data.service blog-product.service
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:17800/healthz >/dev/null 2>&1; then
    systemctl is-active --quiet blog-data.service blog-product.service
    echo "部署完成: https://$SERVER_NAME"
    exit 0
  fi
  sleep 0.5
done
echo "healthz 超时" >&2
exit 1
