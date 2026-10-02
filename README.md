# Emila 的博客

基于 **Astro 7** 的静态个人博客。无评论、无后端、无 UI 框架 —— 访客端默认零 JavaScript（播放器与粒子特效是仅有的两处客户端脚本）。

线上地址：<https://emila58035.github.io/blog/>

方案与决策记录见 [PLAN.md](./PLAN.md)。

## 技术栈

| 项 | 选择 | 说明 |
|---|---|---|
| 框架 | Astro 7.3.5 | 静态输出，`output: 'static'` |
| 依赖 | 4 个 | `astro`、`@astrojs/rss`、`@astrojs/sitemap`、`sharp`。刻意不装 UI 框架、Tailwind、MDX |
| 路由过渡 | `<ClientRouter />` | 客户端导航，配合 `transition:persist` 让音乐跨页不断 |
| 音乐播放器 | 自研原生 | 只用 `<audio>` + 原生 DOM API，不依赖 APlayer/MetingJS |
| 歌单 | 网易云歌单 | 经 Meting API 取流，由 `tools/music/fetch-playlist.mjs` 生成 |
| 部署 | GitHub Pages | `withastro/action` |

## 本地开发

要求 Node ≥ 22.12（本机实测 v24.16.0）。

```bash
npm install
npm run dev       # 开发服务器 http://localhost:4321/blog/
npm run build     # 构建到 dist/
npm run preview   # 预览构建产物
```

注意开发与预览的地址都带 `/blog/` 前缀（`base` 配置所致）。

## 写文章

在 `src/content/posts/` 下新建 Markdown 文件。文件名即 URL 片段：`my-post.md` → `/blog/posts/my-post/`。

frontmatter 字段由 `src/content.config.ts` 用 Zod 校验：

```markdown
---
title: 文章标题
date: 2026-10-02
description: 一句话摘要，会用于首页列表、文章 meta 与 RSS
tags: [建站, Astro]
draft: false
---
```

`date` 缺省会报错；`draft: true` 的文章不会出现在任何列表里。

## 更换音乐歌单

歌单数据来自 `public/audio/playlist.json`，它由脚本生成，**不要手改**。

```bash
node tools/music/fetch-playlist.mjs <网易云歌单ID>
```

脚本会用网易云的播放列表接口读取整张歌单的 `fee` 字段，只保留能完整播放的曲目：

| `fee` | 含义 | 是否保留 |
|---|---|---|
| `0` | 免费 | ✅ |
| `8` | 完整音频（实测 320 kbps） | ✅ |
| `1` | 只有 30 秒试听 | ❌ 自动跳过 |

> 这条过滤是必需的。`fee:1` 的曲目在公共 Meting API 上同样只返回 30 秒（限流在网易云侧），放进歌单会播放一半就断。

**换自建 Meting 后端**只需改环境变量，然后重新生成歌单，播放器代码不用动：

```bash
METING_API=https://你的地址/ node tools/music/fetch-playlist.mjs 60198
```

播放器对 `src` 的处理是「含 `://` 当完整 URL，否则按站内路径解析」，所以将来想改成完全自托管（把音频文件放进 `public/audio/`，歌单写相对路径）也不用改代码。

## 部署

推送到 `main` 分支即自动部署，工作流在 [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)。

**首次部署前需要在仓库里做一次设置**：Settings → Pages → Source 选择 **"GitHub Actions"**。这一步只能在网页上点，工作流本身无法代劳。

几个已经踩过或需要留意的点：

- **`package-lock.json` 必须提交**。`withastro/action` 靠扫描 lockfile 识别包管理器，没有它就无法安装依赖。
- **`base` 必须是 `/blog`**。仓库名不是 `<用户名>.github.io` 时 GitHub Pages 会把站点放在子路径下，所有内部链接都要带这个前缀。代码里统一用 `src/utils/url.ts` 的 `href()` 拼接，**不要手写 `/xxx` 开头的绝对路径**（曾因此让 favicon 404）。
- **换自定义域名**：`public/CNAME` 写入域名，`astro.config.mjs` 的 `site` 改成域名并**删掉 `base`**（同时 `href()` 会自然退化成根路径）。
- 站点不做服务端渲染，`sitemap` 集成要求配置 `site`，已配好。
- `.gitignore` 忽略 `node_modules/`、`dist/`、`.astro/`，其余（含 `public/audio/playlist.json`）都进仓库。构建在 CI 上完成，本地 `dist/` 无需提交。

## 目录结构

```
├─ .github/workflows/deploy.yml   # 部署工作流
├─ astro.config.mjs               # site / base / sitemap 配置
├─ PLAN.md                        # 完整方案与实测记录
├─ tools/music/fetch-playlist.mjs # 生成歌单
├─ public/
│  ├─ favicon.svg
│  └─ audio/playlist.json         # 歌单（脚本生成）
└─ src/
   ├─ content.config.ts           # ★ 不是 src/content/config.ts
   ├─ content/posts/*.md
   ├─ layouts/BaseLayout.astro    # html/head + ClientRouter + 粒子 + 持久化播放器
   ├─ components/
   │  ├─ Header.astro  Footer.astro
   │  ├─ Player.astro             # 音乐播放器（整个 dock 带 transition:persist）
   │  └─ effects/Particles.astro  # canvas 粒子背景
   ├─ pages/                      # index / archive / about / posts / tags / rss.xml
   ├─ styles/global.css
   └─ utils/{date,url}.ts
```

## 改代码时的两条硬约束

**① `transition:persist` 必须打在整个容器上，不能只打在 `<audio>` 上。**

播放器的持久化写在 `.player-dock` 这个 `<div>` 上。如果只把属性放到 `<audio>`，音频确实能跨页不断，但按钮/标题/进度条会被新页面的副本替换 —— 那些新节点上没有任何事件监听，而初始化守卫又阻止了重新绑定，结果是「歌在放，按什么都没反应」。

**② 每个页面都必须服务端渲染出同名的持久元素。**

持久化靠新旧两个文档都有 `data-astro-transition-persist="player"`。播放器渲染在 `BaseLayout` 里，所以所有页面都有；新增独立布局时要记得一并引入。

另外，播放器的初始化脚本带 `dock.dataset.ready` 守卫、只执行一次。持久元素本身不会被重建，**不要**在每次 `astro:page-load` 都去创建播放器实例或重新绑定监听。

## 特效的降级行为

粒子背景是纯装饰，以下情况自动关闭（直接移除 canvas）：

- 视口宽度 ≤ 48rem（移动端）
- 系统开启了 `prefers-reduced-motion`

播放器在 `prefers-reduced-motion` 下只是关掉过渡动画，功能不受影响。

## 已知风险

- **公共 Meting 实例是单点**。当前用的是 `api.injahow.cn`，公共实例历史上有关停先例。换自建后端不需要改代码，但需要重新生成歌单。
- **上游协议在变**。网易云 2026 年已切到 EAPI，2026 年之前写的自建 Meting 端可能失效 —— 将来自建时优先选已适配 EAPI 的实现。
- **版权**。走 Meting 时音频由第三方直链提供，本站不存储不转发；公开站点请自行斟酌曲目。
