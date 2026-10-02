# Emila 的博客

基于 **Astro 7** 的静态个人博客。无评论、无后端、无 UI 框架 —— 访客端默认零 JavaScript（播放器与粒子特效是仅有的两处客户端脚本）。

线上地址：<https://emila58035.github.io/blog/> —— 已上线并验收通过（见下方「部署」）。

方案与决策记录见 [PLAN.md](./PLAN.md)。

## 日常更新

改完内容或代码，两条命令就够：

```bash
git add -A && git commit -m "你的提交信息"
git push
```

推送到 `main` 后 GitHub Actions 会自动构建部署，约 1 分钟。**不需要手动构建或上传 `dist/`**。进度看 <https://github.com/emila58035/blog/actions>。

本地想先看一眼效果再推，用 `npm run dev`（<http://localhost:4321/blog/>）—— 改文件会自动刷新，`Ctrl+C` 停止。**改了什么没推上去就不算发布**，本地改动不推 push 对线上没有任何影响。

写作与歌单的详细用法见下面「[写文章](#写文章)」与「[更换音乐歌单](#更换音乐歌单)」。

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

在 `src/content/posts/` 下新建 Markdown 文件。**文件名即 URL 片段**：`my-post.md` → `/blog/posts/my-post/`。文件名建议用英文或拼音（中文文件名能用，但网址里会被百分号转义）。

frontmatter 字段由 `src/content.config.ts` 用 Zod 校验：

```markdown
---
title: 文章标题
pubDate: 2026-10-02
updatedDate: 2026-10-05
description: 一句话摘要，会用于首页列表、文章 meta 与 RSS
tags: [建站, Astro]
draft: false
---

正文从这里开始。
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | ✅ | 标题 |
| `pubDate` | ✅ | 发布日期，`2026-10-02` 这种格式最稳 |
| `description` | 可选 | 摘要，出现在首页列表与 RSS |
| `tags` | 可选 | 数组，每个标签会自动生成一个标签页 |
| `updatedDate` | 可选 | 与 `pubDate` 不同时，正文顶部显示「修订于 …」 |
| `draft` | 可选 | `true` 则**完全不生成**（首页、归档、标签页、RSS、文章页都没有） |

⚠️ **`pubDate` 缺省或格式错，构建会直接失败**（Zod 校验），CI 会红叉。这是最常见的出错原因。
⚠️ `draft: true` 的文章**本地也没法用网址访问**（路由不存在），不是「能预览但不发布」。

写完之后发布、修改、删除，都是同一套动作 —— 见上面「[日常更新](#日常更新)」：

- **发布**：新建 `.md` → `git add -A; git commit -m "新增文章：…"; git push`
- **修改**：改文件内容 → 重新 commit + push。只改标题不改文件名，网址不变
- **删除**：删掉文件 → commit + push。⚠️ **旧网址会变成 404，没有自动跳转**；已被分享或收录的文章建议另留说明
- **改文件名** = 改网址，旧链接同样会 404

## 更换音乐歌单

歌单数据来自 `public/audio/playlist.json`。

**① 拿到网易云歌单 ID** —— 网页版进歌单，地址栏形如 `https://music.163.com/#/playlist?id=7572834094`，`id=` 后面那串数字就是。歌单**必须是公开的**，私密歌单拉不到。

**② 重新生成**：

```bash
node tools/music/fetch-playlist.mjs <网易云歌单ID>   # 省略参数则用默认的 7572834094
```

输出形如 `《常听》共 78 首，保留 78 首，跳过 0 首（仅试听）`，然后 commit + push 即可。

脚本通过官方前端的加密接口 `/weapi/v6/playlist/detail`（AES + RSA 加密参数，并带 `Cookie: os=pc`）读取整张歌单，再按 `fee` 字段只保留能完整播放的曲目：

> ⚠️ **别退回轻量端点。** `/api/v6/playlist/detail` 对**用户自建歌单只返回前几首**
> （实测 171 首的歌单只给 6 首、78 首的只给 10 首），而 `trackIds` 里才是全量 ——
> 之前"导进来少了一大半"就是这个原因，且该端点的 `n`/`limit` 参数对用户歌单无效。
> `os=pc` 这个 cookie 也是必需的，去掉后同一个加密端点同样只回 6~10 首。
> 脚本现在会自检：数量与 `trackCount` 不符、或过滤掉超过一半时会打印警告。

| `fee` | 含义 | 是否保留 |
|---|---|---|
| `0` | 免费 | ✅ |
| `8` | 完整音频（实测 320 kbps） | ✅ |
| `1` | 只有 30 秒试听 | ❌ 自动跳过 |

> 这条过滤是必需的。`fee:1` 的曲目在公共 Meting API 上同样只返回 30 秒（限流在网易云侧），放进歌单会播放一半就断。
> 不过**自己的歌单常常一首都不需要过滤**：当前用的《常听》78 首全是 `fee=0`/`fee=8`，全部可完整播放。被过滤得多说明选的歌单偏向版权保护曲目，换一张往往比折腾播放器更省事。

**③ 手动加减单曲**：可以直接编辑 `public/audio/playlist.json` 的 `tracks` 数组。

```json
{
  "tracks": [
    {
      "id": 3410257938,
      "title": "Been By Now",
      "artist": "Morgan Wallen",
      "src": "https://api.injahow.cn/meting/?server=netease&type=url&id=3410257938",
      "cover": "https://api.injahow.cn/meting/?server=netease&type=pic&id=3410257938",
      "lrc": "https://api.injahow.cn/meting/?server=netease&type=lrc&id=3410257938"
    }
  ]
}
```

- 播放器实际只读 **`src`、`title`、`artist`** 三个字段（`cover`、`lrc` 目前未使用，留着是给以后加封面与歌词的余地）。
- **`src` 含 `://` 当作完整 URL，否则按站内路径解析** —— 所以也可以把**自己的音频丢进 `public/audio/`**，然后写相对路径 `audio/mine.mp3`，与网易云曲目混在同一张歌单里（将来想完全自托管也是这条路，不用改代码）。
- ⚠️ 下次再跑 `fetch-playlist.mjs` 会**整个覆写**这个文件，手改内容会丢；要长期保留就先备份。

**④ 换自建 Meting 后端**只需改环境变量，然后重新生成歌单，播放器代码不用动：

```bash
METING_API=https://你的地址/ node tools/music/fetch-playlist.mjs 7572834094
```

## 部署

推送到 `main` 分支即自动部署，工作流在 [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)。

**首次部署的一次性设置已完成**：Settings → Pages → Source 需选 **"GitHub Actions"**（默认是 "Deploy from a branch"）。这一步只能在网页上点，工作流本身无法代劳；漏设的症状是 workflow 在 deploy 阶段报 `Get Pages site failed`，补设后 re-run 即可。

**上线验收结果**（2026-10-02，真实 Edge 154 对**线上站点**实测）：13 个页面与全部静态资源均 200，`favicon.svg` 解析为 `/blog/favicon.svg`；播放器加载 33 首、真实时长 213.8s、播放走 `m801.music.126.net` 的 206 `audio/mpeg`；客户端导航后播放器元素身份保持、时间轴继续推进、保持播放、标题不变，深色主题不闪；整页刷新后主题仍被恢复。无 HTTP 错误、无控制台报错。

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
