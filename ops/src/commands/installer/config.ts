/** `blog.json` 的解析、校验与骨架生成。包含秘密,权限 0600,不进 argv/日志。 */

export interface BlogConfig {
  readonly serverName: string;
  readonly contentRepo: string;
  readonly contentToken: string;
  readonly buildTag: 'latest';
}

const SERVER_NAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const PLACEHOLDER = /^(|REPLACE_ME|example\.com|owner\/repo|owner\/blog-content)$/;

export function configTemplate(seed: Partial<BlogConfig> = {}): string {
  const value: BlogConfig = {
    serverName: seed.serverName ?? 'example.com',
    contentRepo: seed.contentRepo ?? 'owner/blog-content',
    contentToken: seed.contentToken ?? '',
    buildTag: 'latest',
  };
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function parseBlogConfig(text: string): BlogConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('blog.json 不是合法 JSON');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('blog.json 顶层必须是对象');
  }
  const value = raw as Record<string, unknown>;
  const allowed = new Set(['serverName', 'contentRepo', 'contentToken', 'buildTag']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`blog.json 未知字段 ${key}`);
  }
  const serverName = typeof value.serverName === 'string' ? value.serverName : '';
  const contentRepo = typeof value.contentRepo === 'string' ? value.contentRepo : '';
  const contentToken = typeof value.contentToken === 'string' ? value.contentToken : '';
  const buildTag = typeof value.buildTag === 'string' ? value.buildTag : '';
  const errors: string[] = [];
  if (!SERVER_NAME_PATTERN.test(serverName) || PLACEHOLDER.test(serverName)) {
    errors.push('serverName 未填写或非法');
  }
  if (!REPO_PATTERN.test(contentRepo) || PLACEHOLDER.test(contentRepo)) {
    errors.push('contentRepo 未填写或非法');
  }
  if (contentToken.length === 0 || PLACEHOLDER.test(contentToken)) {
    errors.push('contentToken 未填写');
  }
  if (buildTag !== 'latest') {
    errors.push('buildTag 当前必须是 latest');
  }
  if (errors.length > 0) throw new Error(errors.join(';'));
  return { serverName, contentRepo, contentToken, buildTag: 'latest' };
}

/** 从 `www.` 主域名派生裸域名别名,供 nginx 的 80 端口跳转使用;非 www 前缀返回空串。 */
export function apexAlias(serverName: string): string {
  return serverName.startsWith('www.') ? serverName.slice(4) : '';
}

/** 从旧散件文件内容里预填骨架(迁移用,缺失项忽略)。 */
export function seedFromLegacy(input: {
  readonly deployEnv?: string;
  readonly productEnv?: string;
}): Partial<BlogConfig> {
  const seed: { serverName?: string; contentRepo?: string; contentToken?: string } = {};
  for (const line of (input.deployEnv ?? '').split('\n')) {
    const [key, ...rest] = line.split('=');
    const value = rest.join('=').trim();
    if (key === 'SERVER_NAME' && value) seed.serverName = value;
    if (key === 'CONTENT_REPO' && value) seed.contentRepo = value;
  }
  for (const line of (input.productEnv ?? '').split('\n')) {
    const [key, ...rest] = line.split('=');
    const value = rest.join('=').trim();
    if (key === 'BLOG_CONTENT_TOKEN' && value) seed.contentToken = value;
  }
  return { ...seed, buildTag: 'latest' };
}
