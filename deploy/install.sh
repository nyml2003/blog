#!/usr/bin/env bash
# 服务器端安装脚本(环境无关):域名与内容仓库名由 /etc/blog/deploy.env 注入。
# 用法:sudo bash install.sh
#   DEPLOY_ENV_FILE=<文件>   可选,默认 /etc/blog/deploy.env
#   TOKEN_FILE=<token 文件>  可选,默认找调用者家目录的 product.env
#   CERT_DIR=<证书目录>      可选,默认找调用者家目录的 cert/
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${DEPLOY_ENV_FILE:-/etc/blog/deploy.env}"
TOKEN_FILE="${TOKEN_FILE:-}"
CERT_DIR="${CERT_DIR:-}"
SERVER_NAME="${SERVER_NAME:-}"
CONTENT_REPO="${CONTENT_REPO:-}"

if [ -f "$CONFIG_FILE" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      ''|'#'*) continue ;;
      SERVER_NAME) SERVER_NAME="${SERVER_NAME:-$value}" ;;
      CONTENT_REPO) CONTENT_REPO="${CONTENT_REPO:-$value}" ;;
    esac
  done < "$CONFIG_FILE"
fi

if ! [[ "$SERVER_NAME" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]]; then
  echo "缺少或非法的 SERVER_NAME:请写入 $CONFIG_FILE 或用环境变量提供" >&2
  exit 1
fi
if ! [[ "$CONTENT_REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]; then
  echo "缺少或非法的 CONTENT_REPO:请写入 $CONFIG_FILE 或用环境变量提供" >&2
  exit 1
fi

render_templates() {
  RENDER_DIR="$ROOT_DIR/.rendered"
  rm -rf "$RENDER_DIR"
  mkdir -p "$RENDER_DIR/systemd" "$RENDER_DIR/nginx"
  sed -e "s|{{serverName}}|$SERVER_NAME|g" -e "s|{{contentRepo}}|$CONTENT_REPO|g" \
    systemd/blog-data.service > "$RENDER_DIR/systemd/blog-data.service"
  sed -e "s|{{serverName}}|$SERVER_NAME|g" -e "s|{{contentRepo}}|$CONTENT_REPO|g" \
    systemd/blog-product.service > "$RENDER_DIR/systemd/blog-product.service"
  sed -e "s|{{serverName}}|$SERVER_NAME|g" -e "s|{{contentRepo}}|$CONTENT_REPO|g" \
    nginx/blog.conf > "$RENDER_DIR/nginx/blog.conf"
  if grep -rq '{{' "$RENDER_DIR"; then
    echo "模板渲染后仍存在未解析占位符" >&2
    exit 1
  fi
}

cd "$ROOT_DIR"
sha256sum -c SHA256SUMS

# 冒烟模式:只校验并渲染模板,用于本地/CI 验证,不需要 root。
if [ "${RENDER_ONLY:-}" = "1" ]; then
  render_templates
  echo "render ok: $SERVER_NAME -> $RENDER_DIR"
  exit 0
fi

if [ "$(id -u)" != "0" ]; then
  echo "请以 root 运行:sudo bash install.sh" >&2
  exit 1
fi

INVOKER_HOME=""
if [ -n "${SUDO_USER:-}" ]; then
  INVOKER_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
fi

render_templates

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

install -m 0644 "$RENDER_DIR/systemd/blog-data.service" /etc/systemd/system/blog-data.service
install -m 0644 "$RENDER_DIR/systemd/blog-product.service" /etc/systemd/system/blog-product.service
systemctl daemon-reload
systemctl enable blog-data.service blog-product.service

install -m 0644 "$RENDER_DIR/nginx/blog.conf" /etc/nginx/sites-available/blog.conf
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
