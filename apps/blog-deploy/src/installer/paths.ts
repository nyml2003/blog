/** `/etc/blog` 布局与安装期常量。 */

export const CONFIG_DIR = '/etc/blog';
export const CONFIG_FILE = `${CONFIG_DIR}/blog.json`;
export const CONFIG_DIR_MODE = 0o700;
export const CONFIG_FILE_MODE = 0o600;

export const BIN_DIR = '/usr/local/bin';
export const DATA_DIR = '/var/lib/blog';
export const WEB_DIR = '/var/lib/blog/web/dist';
export const PRODUCT_ENV = '/var/lib/blog/product.env';
export const UNIT_DIR = '/etc/systemd/system';
export const NGINX_AVAILABLE = '/etc/nginx/sites-available/blog.conf';
export const NGINX_ENABLED = '/etc/nginx/sites-enabled/blog.conf';
export const NGINX_CERT_DIR = '/etc/nginx/cert';
export const HEALTH_URL = 'http://127.0.0.1:17800/healthz';
export const RELEASE_REPO = 'nyml2003/blog';
