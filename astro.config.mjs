// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages：仓库为普通仓库 blog，站点地址带 /blog 前缀
const SITE = 'https://emila58035.github.io';
const BASE = '/blog';

export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  integrations: [sitemap()],
  devToolbar: { enabled: false },
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Noto Sans SC',
      cssVariable: '--font-body',
    },
  ],
});
