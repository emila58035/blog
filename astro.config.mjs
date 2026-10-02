// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages：仓库为普通仓库 blog，站点地址带 /blog 前缀
const SITE = 'https://emila58035.github.io';
const BASE = '/blog';

// 字体说明：不加载 CJK 网络字体。
// 实测 Noto Sans SC 走 Fonts API 只会下发 Latin 子集（13 KB，unicode-range 不含 CJK），
// 对中文正文毫无作用；而完整 CJK 覆盖需要 101 个子集、约 3 MB。
// 对轻量化目标而言不划算，故正文使用系统字体栈（见 src/styles/global.css）。
export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap()],
  devToolbar: { enabled: false },
});
