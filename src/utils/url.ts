/**
 * 站点根路径，始终以 / 结尾。
 * Astro 的 import.meta.env.BASE_URL 会随 trailingSlash 配置变化，
 * 在 trailingSlash: 'always' 下是 '/blog/'，这里兜一层保证一致。
 */
export const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

/**
 * 拼接站内链接。
 * href('/archive/')   → '/blog/archive/'
 * href('')            → '/blog/'
 */
export function href(path = ''): string {
  return BASE + path.replace(/^\//, '');
}
