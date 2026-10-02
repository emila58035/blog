# 个人博客 · Astro 7 实施方案

- 方案版本：v4（2026-10-02），已按 6 条批注修正；M0–M3 已落地，M3 关键关卡实测通过
- 目标目录：`D:\Emila_58035\blog`
- 部署：**GitHub Pages**（用户指定）
- 范围：**不做评论功能**
- MVP 特效：背景图 + 顶栏 + 粒子 + 固定音乐播放器（光标拖尾/点击爆裂后置）
- 音乐源：**网易云歌单**（依赖自建 Meting API）

---

## 0. 本机环境（已实测）

| 项 | 值 |
|---|---|
| Node | v24.16.0 ✅（Astro 7 要求 ≥22.12.0） |
| npm | 11.13.0 |
| git | 2.54.0.windows.1 |
| Python | 3.11 |
| 磁盘 | D 盘剩余 87.90 GB |
| Hugo/Go | 未安装（本方案不需要） |

锁定的包版本（本机 `npm view` 实测，2026-10-02）：

```
astro 7.3.5                     @astrojs/rss 4.0.19
@astrojs/sitemap 3.7.4          sharp 0.35.5
```

**刻意不装**：`@astrojs/markdown-remark`（v7 默认 Markdown 管线已是 Sätteri，自带 GFM + SmartyPants，不需要 remark/rehype 插件）、`@astrojs/mdx`、任何 UI 框架、Tailwind。

---

## 1. 架构决策

| 项 | 选择 | 理由 |
|---|---|---|
| 生成器 | Astro 7.3.5 | 用户指定；Rust 编译器 + Vite 8 |
| UI 框架 | 不装 | 原生 `<script>` + Astro 组件足够 |
| 内容 | Content Collections + Markdown | zod 校验 frontmatter，写错构建期报错 |
| 样式 | 原生 CSS + scoped `<style>` + CSS 变量 | 零依赖 |
| 路由 | 静态 + `<ClientRouter />` | **跨页不断歌的唯一干净解法** |
| 播放器 | APlayer + MetingJS（CDN 直引） | 不引入 npm 依赖，避开腐化包 |
| 托管 | GitHub Pages + `withastro/action` | 用户指定，免费 |
| 搜索 | 暂不做 | MVP 不需要 |
| 评论 | **不做** | 用户批注 |

---

## 2. 目录结构

```
D:\Emila_58035\blog\
├─ PLAN.md                     # 本文件
├─ astro.config.mjs
├─ package.json
├─ tsconfig.json               # extends "astro/tsconfigs/base"
├─ .github/workflows/deploy.yml
├─ public/
│  ├─ favicon.svg
│  ├─ cursor/arrow.png         # 自定义光标（public = 原样拷贝，正合适）
│  └─ audio/*.mp3              # 第一批音乐源（自托管，最稳）
└─ src/
   ├─ content.config.ts        # ★ 不是 src/content/config.ts
   ├─ content/posts/*.md
   ├─ assets/bg.jpg            # 需优化的背景图放这儿
   ├─ layouts/
   │  ├─ BaseLayout.astro      # ★ html/head/ClientRouter + persist 播放器
   │  └─ PostLayout.astro
   ├─ components/
   │  ├─ Header.astro  Footer.astro  Background.astro  PostCard.astro
   │  ├─ MusicPlayer.astro
   │  └─ effects/ Particles.astro
   ├─ pages/
   │  ├─ index.astro  archive.astro  about.astro
   │  ├─ posts/[...id].astro
   │  ├─ tags/[tag].astro
   │  └─ rss.xml.js
   └─ styles/global.css
```

---

## 3. Astro 7 的三条硬规矩

**① `<script>` 处理分水岭**

官方原文：*"Astro will not process a `<script>` tag if it has any attribute other than `src`."*（`is:inline` 是隐含的）

| 写法 | 行为 |
|---|---|
| `<script>`（无属性） | TypeScript、打包、自动 `type="module"`、**去重（每页只出现一次）**、小则自动内联。**一生只执行一次，导航中被重新插入也会被忽略** |
| `<script is:inline>` | 不打包、**不去重（每实例复制一份）**、`import`/`url()` 不解析、**会被重复执行** |

→ 粒子/光标逻辑用**默认 `<script>`**；第三方 CDN 脚本用 `is:inline src=`，且**放进 persist 容器内**。

**② `compressHTML` 默认已变为 `'jsx'`，行内元素间空格会被吃掉**

官方例子：`<span>hello</span>` 换行 `<em>world</em>` → 渲染成 `helloworld`。
修法：`{" "}` 显式插空格，或配置 `compressHTML: true` / `false`。

**③ Rust 编译器是唯一编译器**

所有非空元素必须闭合（`<br> <img> <input> <hr>` 等空元素除外）；语义非法 HTML **不再自动修正**（如 `<p>` 里塞 `<div>` 会被浏览器提前闭合）。CSS 序列化可能变化（`rebeccapurple` → `#639`），仅为表象差异。

---

## 4. 内容层

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';          // ★ 不是 astro:content

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
```

- `glob()` 签名 `(options: GlobOptions) => Loader`（v5.0.0+），选项 `pattern` / `base` / `generateId` / `retainBody` / `deferRender`。
- **绝不用** `type: 'content'` / `type: 'data'`（v7 只能靠 `legacy.collectionsBackwardsCompat` 续命）。
- **不用** `src/content/config.ts`（v7 文档中不存在该路径）。
- 文章上千篇时可用 `deferRender: true`（v7.1.0+）省内存。

```astro
---
// src/pages/posts/[...id].astro
import { getCollection, render } from 'astro:content';
import PostLayout from '../../layouts/PostLayout.astro';

export async function getStaticPaths() {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts.map((post) => ({ params: { id: post.id }, props: { post } }));
}
const { post } = Astro.props;
const { Content, headings } = await render(post);
---
<PostLayout post={post} headings={headings}><Content /></PostLayout>
```

---

## 5. 架构心脏：跨页不断歌

```astro
---
// src/layouts/BaseLayout.astro
import { ClientRouter } from 'astro:transitions';
import { Font } from 'astro:assets';
import Header from '../components/Header.astro';
import Background from '../components/Background.astro';
import Particles from '../components/effects/Particles.astro';
import '../styles/global.css';
const { title = 'Emila 的博客' } = Astro.props;
const base = import.meta.env.BASE_URL;
---
<html lang="zh-CN" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <ClientRouter />
    <Font cssVariable="--font-body" preload />
    <title>{title}</title>
  </head>
  <body>
    <Background />
    <Header />
    <main><slot /></main>

    <!-- ★ 脚本与容器一起 persist：导航时不重建、不重复注册自定义元素 -->
    <div class="player-dock" transition:persist>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/aplayer@1/dist/APlayer.min.css" />
      <script is:inline src="https://cdn.jsdelivr.net/npm/aplayer@1/dist/APlayer.min.js"></script>
      <script is:inline src="https://cdn.jsdelivr.net/npm/meting@2/dist/Meting.min.js"></script>
      <meting-js
        api={`${import.meta.env.PUBLIC_METING_API}`}
        server="netease" type="playlist" id="替换成你的歌单ID"
        fixed="true" mini="false" autoplay="false" preload="none"
      ></meting-js>
    </div>

    <Particles />
  </body>
</html>
```

**为什么不会断歌（已从 ClientRouter 运行时源码确认机制）**：`<ClientRouter />` 打包产物里定义常量 `t = 'data-astro-transition-persist'`，交换 body 时执行：

```js
// 反混淆自 dist/_astro/ClientRouter.*.js
const a = new Set(newDoc.querySelectorAll('video, audio'));          // 新页面里的全部媒体元素
const o = typeof documentElement.moveBefore === 'function'
  ? (parent, node, ref) => parent.moveBefore(node, ref)              // 原子移动（Chrome 133+）
  : null;
for (const oldEl of oldDoc.querySelectorAll(`[${t}]`)) {             // 旧页面里带 persist 的元素
  const key = oldEl.getAttribute(t);
  const newTarget = newDoc.querySelector(`[${t}="${key}"]`);         // 按名字在新页面找锚点
  if (newTarget) {
    o ? o(documentElement, oldEl, null) : documentElement.appendChild(oldEl);
    pairs.push({ old: oldEl, newTarget });
  }
}
newDoc.replaceWith(oldDoc);
for (const { old, newTarget } of pairs)
  o ? o(newTarget.parentNode, old, newTarget) : newTarget.replaceWith(old);   // 落回原位
afterSwap(newDoc, mediaSet);
```

三个要点：
1. **匹配依据是 `data-astro-transition-persist`，不是 CSS 属性 `transition:persist`**。SSR 阶段编译器把 `transition:persist="m3player"` 转成 `data-astro-transition-persist="m3player"`，所以**新旧两个页面的服务端 HTML 里都必须有这个属性**，否则客户端找不到锚点，元素直接被替换。
2. **用 `moveBefore()` 做原子移动**，媒体元素播放状态跨移动保留；浏览器不支持时才退回 `appendChild` / `replaceWith`。
3. 交换后有个 `afterSwap` 步骤（源码里的 `l()`）：遍历新文档的 `video, audio`，**凡是不在持久集合里的都会被 `document.createElement` + 复制属性重建**——也就是说非持久媒体会被强制重置，持久的则原样保留。这正是"新页面的 `<audio>` 会被重置、持久化的不会"的实现。

**生效前提**：`<ClientRouter />` 必须存在（源码可见 persist 是路由器的 swap 逻辑，不是独立指令）。这条现已从源码确认，不再是 NOT VERIFIED。

**已核实的官方限制**：*"The restart of CSS animations and the reload of iframes cannot be avoided during view transitions even when using `transition:persist`."* → **iframe 方案作废**。

### ★ M3 实测结果（2026-10-02，真实 Edge 154 + 真实 `<audio>`，**通过**）

实测方法：两个最小页面（`src/pages/m3check.astro`、`src/pages/archive-audit.astro`）各渲染同一个 `<audio transition:persist="m3player" src="/blog/audio/_audit-tone.wav">`；用 CDP（Edge `--headless=new` + `--autoplay-policy=no-user-gesture-required`）真实驱动浏览器，给元素盖随机戳后播放，再走前进/后退/再前进三段导航。**driver 不创建播放器、不注册任何 `astro:page-load` 回调**，避免干扰结论。

| 检查项 | 前进 | 后退（点链接） | 再前进 |
|---|---|---|---|
| 元素身份（随机戳）保持 | ✅ | ✅ | ✅ |
| 导航后仍 `paused === false` | ✅ | ✅ | ✅ |
| 时间轴跨交换继续推进 | ✅ 1.892 → 1.998 | ✅ 4.019 → 4.144 | ✅ 4.145 → 4.540 |
| 交换后 200ms 采样单调不减 | ✅ | — | — |

- 环境确认：`typeof document.documentElement.moveBefore === 'function'` → **true**（走原子移动路径）。
- 结论：**`transition:persist` 对 `<audio>` 有效，官方文档缺 `<audio>` 示例但机制通用**。方案的心脏成立，不需要启用 localStorage 降级作为主方案。
- 顺带否掉的写法：手工 `setAttribute('transition:persist', '')` **不起作用**（运行时只认 `data-astro-transition-persist`）——实测中该写法元素在导航后消失。

**降级顺序**（仍保留为兜底，正常路径不会走到）：
1. localStorage 记忆播放进度 + 切页后自动 seek 续播（会有一丝断缝，零兼容风险）
2. 播放器改为固定在侧栏、不追求跨页连续（接受每页重载）

**实现约束（M3 实测得出）**：
- 播放器的初始化和 `.play()` 必须**加守卫只做一次**（例如 `if (audio.dataset.ready) return;`）。持久元素本身不会被重建，所以任何在每次 `astro:page-load` 都执行的初始化代码都会造成"歌照放、UI/实例被重建"的隐性 bug —— 我第一版实测脚本正是踩了这个坑，用 localStorage 复用同一个 id 反而伪造出"元素被保留"的假象。
- 持久化元素必须由**两个页面都服务端渲染**出来（同一 `data-astro-transition-persist` 名字）。只在一侧出现的元素无法持久化。

---

## 6. 音乐播放器：实现原理、歌曲来源、歌单定义

### 6.1 组件分工

| 组件 | 职责 |
|---|---|
| **MetingJS**（`<meting-js>` 网页组件） | 向后端 API 要数据，产出**歌单列表 + 每首歌的可播放 URL**，并负责创建播放器 UI |
| **APlayer**（`APlayer.min.js`） | 真正播放音频、渲染播放器界面（进度条/音量/歌词/循环模式） |
| **Meting API**（后端服务） | 把"歌单ID"翻译成"歌曲清单 + 音频直链"，代理网易云的接口 |

### 6.2 数据流

```
页面加载
  └─ <meting-js server="netease" type="playlist" id="歌单ID" api="你的API地址">
       └─ 浏览器请求: GET {api}?server=netease&type=playlist&id=歌单ID
            └─ Meting API 转发到网易云接口，拿回歌单内每首歌的元数据与音频地址
                 └─ 返回 JSON 数组: [{ name, artist, url, pic, lrc }, ...]
                      └─ MetingJS 把数组交给 APlayer
                           └─ APlayer 生成播放列表 UI；用户点击某首歌时
                                用该曲目的 url 去拉音频流并播放
```

**关键点**：歌单内容**不是打包进站点的**，而是页面加载时**动态从 API 拉取**的。所以：
- 改歌单**不需要重新构建/部署**，刷新即生效（前提是用歌单ID而非硬编码曲目）。
- API 是唯一的运行时依赖，**API 挂了歌单就是空的**。

### 6.3 歌曲从哪里来

音频**不经过你的博客服务器**。Meting API 返回的 `url` 是第三方（网易云）的音频直链，浏览器**直接从该地址拉流**。意味着：
- 你不存储、不转发音频，因此**不占用托管流量**。
- 代价：链接由第三方控制，**可能失效或被限流**（尤其 VIP/版权曲目，未登录拿不到完整音频）。
- **版权风险由使用者自担**，公开站点建议谨慎。

### 6.4 歌单怎么定

1. 在网易云音乐里**创建或找一个歌单**（网页版打开歌单，URL 形如 `https://music.163.com/#/playlist?id=60198`）。
2. 记下 **`id=` 后面那串数字**，例如 `60198`。
3. 把它填进 `<meting-js>` 的 `id` 属性即可。

```html
<meting-js api="https://你的API地址" server="netease" type="playlist" id="60198"></meting-js>
```

**`server` / `type` 可选值**（来自 MetingJS 文档）：
- `server`：`netease`（网易云）、`tencent`（QQ音乐）、`kugou`、`xiami`、`baidu`
- `type`：`song`（单曲，此时 `id` 填歌曲ID）、`playlist`（歌单）、`album`、`search`、`artist`

**常用可选属性**：`fixed`（固定悬浮）、`mini`（迷你模式）、`autoplay`、`theme`（主题色）、`loop`、`order`（`list`/`random`/`single`）、`preload`、`volume`、`mutex`、`list-folded`、`list-max-height`、`lrc-type`、`storagename`（localStorage 键名，用于记忆状态）。

> **字段契约已从 APlayer 源码实测确认**（`APlayer.min.js` v1.10.1 原文）：
> `e.name=e.name||e.title||"Audio name", e.artist=e.artist||e.author||"Audio artist", e.cover=e.cover||e.pic, e.type=e.type||"normal"`
> 即 `name/title`、`artist/author`、`cover/pic` 互为兜底 —— 所以返回 `title/author/pic` 结构的 API（如 i-meto）APlayer 能直接吃下。

### 6.5 后端 API：为什么必须自建（已实测验证）

**实测（2026-10-02，全部实发 HTTP 请求）：**

| 服务 | `type=playlist` | `type=url`（播放链路） |
|---|---|---|
| `api.i-meto.com`（MetingJS 内置默认端点） | ✅ 200，JSON，89 条 | ❌ **404**（换 6 首不同歌全部 404；带它自己下发的 `auth` 也 404，不带 `auth` 则 401） |
| `api.injahow.cn/meting/` | ✅ 200，89 条 | ✅ 302 → 200 `audio/mpeg` |

**两个关键结论：**

1. **歌单 JSON 里的 `url` 字段是间接地址，不是直链。** i-meto 实测返回：
   `"url":"https://api.i-meto.com/meting/api?server=netease&type=url&id=2755496359&auth=..."` —— 它指回**同一个 API 的 `type=url` 端点**，由该端点再 302 跳到网易 CDN（实测落地 `m10.music.126.net`、`m702.music.126.net`）。`pic` 同理指向 `type=pic`（302），`lrc` 指向 `type=lrc`（纯文本）。
   → **MetingJS 播放一首歌需要两级请求**，只通第一级 = 有列表但点不响。i-meto 恰好坏在第二级。
2. 所以"公共 API 不可靠"不是猜测，**是已经实测到的事实**（两个公共实例里坏了一个）。

**阶段策略（维持三阶段不变，但风险评级已下调）：**

- **阶段一（M0–M4）**：不连网易云。用 `public/audio/*.mp3` 自托管音频 + 手写静态歌单 JSON，喂给 APlayer。**零外部依赖，播放器先跑通。**
- **阶段二（M5）**：自建 Meting API，部署后把地址填进 `<meting-js api="...">`，切到网易云歌单。地址通过 `PUBLIC_METING_API` 环境变量注入，**不硬编码**，方便随时换。
- **阶段三（可选）**：若网易云接口因登录/加密变化而不可用，退回自托管音频，播放器架构不变。

**网易云 cookie 问题：已实测澄清（原"最大不确定性"解除一半）**

**免费歌不需要 cookie：**
- `GET https://music.163.com/api/playlist/detail?id=60198` → **200**（275 KB）；`/api/v6/playlist/detail?id=60198&n=1000` → **200**
- `GET /api/song/detail?ids=[2755496359]` → **200**
- 免费歌 `28391863`：`/song/media/outer/url?id=...mp3` → **302 → 真实 mp3**；`/api/song/enhance/player/url` → 返回带 `vuutv` token 的真实 URL

**VIP 歌（`fee:1`）不行，且即便拿到也只有 30 秒：**
- `2755496359`：outer-url → **302 → `Location: http://music.163.com/404`**
- `enhance/player/url` → `{"url":null,...,"code":-110,...,"fee":1}`
- injahow 对该曲下发 302 → `audio/mpeg`，但**只有 481,115 字节**；解析 MPEG 帧 = MPEG1 Layer III **128 kbps @ 44100 Hz → 30.07 秒**，两首不同 VIP 歌字节数完全相同
- → **运维铁律：歌单里只放免费歌。** VIP 曲不要放，放了就是 30 秒试听，或者直接报错。

**自建服务端选型（仅读 README，未部署）：**

| 项目 | 形态 | 备注 |
|---|---|---|
| `metowolf/Meting` | **已不是 PHP**，README 原文 *"This is the Node.js version of the original PHP Meting project"*（`@meting/core`） | 只是库，不提供现成 REST 层 |
| `mikus-loli/Meting-API` | Node ≥18 + Hono；Docker `ghcr.io/mikus-loli/meting-api:latest` :3000；支持 Vercel / Cloudflare Workers；netease + tencent | **VIP 播放需 Cookie（`MUSIC_U`）**；默认管理员 `admin/admin123`；Vercel/CF 上跑不了管理面板 |
| **`Zxis233/meting-workers`** | **Cloudflare Workers 移植** | ✅ **首选**。依赖 `NETEASE_COOKIE`（含 `MUSIC_U`）才有 VIP，但变量有内置默认值；用 **EAPI**，Cookie 续期走 WEAPI `login/token/refresh` 存 KV；作者 2026.06.15 原文 *"现在需要用新的EAPI"*（上游协议已变），2026.06.04 原文 *"使用二维码登录后的Cookie是刷新不了的！"*；更新于 2026.08.13 |
| `liuran001/meting-api` | PHP，上述移植之上游 | `main` 分支 raw README → 404，**NOT VERIFIED** |

> ⚠️ 上游 2026 年已切到 **EAPI** 协议。任何 2026 年之前写的自建端都可能突然失效 —— 选型时优先挑已适配 EAPI 的（如 `meting-workers`）。

---

## 7. 三项需求的实现

### ① 自由布局 / 背景图 / 顶端栏

```astro
---
// src/components/Background.astro
import { getImage } from 'astro:assets';
import bg from '../assets/bg.jpg';
const bgUrl = (await getImage({ src: bg, width: 1920, format: 'webp' })).src;
---
<div class="bg" style={`--bg-url: url(${bgUrl})`} aria-hidden="true"></div>
<style>
  .bg { position: fixed; inset: 0; z-index: -1;
        background: var(--bg-url) center/cover no-repeat fixed; }
  .bg::after { content: ''; position: absolute; inset: 0;
        background: color-mix(in srgb, var(--bg) 72%, transparent); }
</style>
```

- 图放 `src/assets/` 会被构建优化；`public/` 原样拷贝、永不优化（官方明确："Images stored in the `public/` folder are never optimized"）。
- 相对 `url()` 是否被处理**无官方书面保证**（NOT VERIFIED），故用官方推荐的 `getImage()` + inline style 写法。
- 顶栏：`position: sticky; top: 0`。**纯 CSS，零风险。**

### ② 音乐播放器
见第 6 节。CDN 三个资源已实测 **HTTP 200**：
`aplayer@1/dist/APlayer.min.js`、`aplayer@1/dist/APlayer.min.css`、`meting@2/dist/Meting.min.js`。

其他约束：浏览器**禁止带声音自动播放**（必须等用户首次点击，浏览器策略，无解）。

### ③ 粒子（光标拖尾已按批注后置）

```astro
<!-- src/components/effects/Particles.astro -->
<canvas id="particles" aria-hidden="true"></canvas>
<script>
  // 默认 script：打包 + 去重 + 每页只执行一次
  const canvas = document.getElementById('particles');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(max-width: 768px)').matches;
  if (canvas && !reduce && !mobile) { /* 手写 <80 行粒子循环 */ }
</script>
```

三条纪律：移动端与 `prefers-reduced-motion` 默认关闭；`visibilitychange` 时暂停 `requestAnimationFrame`；粒子数 ≤60、`devicePixelRatio` 上限 2。不引第三方库。

---

## 8. 字体与样式基座

```mjs
// astro.config.mjs
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const SITE = 'https://<你的用户名>.github.io';
const BASE = '/blog';            // 若仓库名为 <用户名>.github.io 则删掉这一行

export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  integrations: [sitemap()],
  fonts: [{
    provider: fontProviders.fontsource(),
    name: 'Noto Sans SC',
    cssVariable: '--font-body',
  }],
});
```

**`base` 是本方案在 GitHub Pages 上最容易踩的坑**（官方原文：*"configure a value for `base` (usually required)"*）：

- 仓库为普通仓库 `blog` → 站点地址是 `https://<用户名>.github.io/blog/`，**必须**设 `base: '/blog'`。
- 仓库名为 `<用户名>.github.io` → **不要**设 `base`。
- 设了 `base` 后，**所有内部链接都要带前缀**（官方 caution 原文：*"all of your internal page links must be prefixed with your `base` value"*）。
- ✅ **规避办法**：模板里统一用 `` `${import.meta.env.BASE_URL}` `` 拼链接（官方支持的写法，*"You can access this value via `import.meta.env.BASE_URL`"*），这样仓库改名/以后上自定义域名都不用改模板。
- `base` 同时作用于 `astro dev`，所以本地预览地址也会变成 `http://localhost:4321/blog/`。

样式三档（均已核实）：
1. 组件内 `<style>` → 自动 scoped，编译成 `h1[data-astro-cid-hhnqfkh6]`（`scopedStyleStrategy` 默认 `'attribute'`）；
2. 穿透到子组件 → `article :global(h1) { … }`；
3. 全站样式表 → 布局 frontmatter **顶部** `import '../styles/global.css';`（打包优化）。

---

## 9. GitHub Pages 部署

**已确认的账号信息（用户批注）**：GitHub 用户名 **emila58035**。

因此配置为：
- `site: 'https://emila58035.github.io'`
- `base: '/blog'` —— 适用于**仓库名为 `blog`** 的情况，线上地址 `https://emila58035.github.io/blog/`
- ⚠️ 如果你新建的仓库名是 `emila58035.github.io`，则必须**删掉 `base`**（详见下方规则）
- 本地预览地址也会是 `http://localhost:4321/blog/`

**`.github/workflows/deploy.yml`**（取自官方文档原文，含最新 action 版本）：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout your repository using git
        uses: actions/checkout@v7
      - name: Install, build, and upload your site
        uses: withastro/action@v6

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
```

要点：
- 必须**提交 `package-lock.json`**（官方 caution：action 靠 lockfile 识别包管理器，默认 Node 24）。
- 仓库 **Settings → Pages → Source 选 "GitHub Actions"**。
- `PUBLIC_METING_API` 这类公开变量通过 action 的 `env:` 传（或 `.env`，但注意 `PUBLIC_` 前缀才会暴露给客户端）。
- 想用自定义域名：`public/CNAME` 写一行域名，配置里 `site` 改成该域名并**删掉 `base`**。

本地验收：
```bash
npm run dev          # http://localhost:4321/blog/
npm run build        # 产物在 dist/
npm run preview
```

---

## 10. 里程碑

| 阶段 | 内容 | 验收标准 | 状态 |
|---|---|---|---|
| **M0** | 手写脚手架：`package.json` / `astro.config.mjs` / `tsconfig.json` / 目录 | `npm run dev` 起得来 | ✅ 完成（提交 `b9b2429`） |
| **M1** | `content.config.ts` + 3 篇样例文章 + 列表页 + `[...id].astro` + RSS/sitemap | 本地能点能读，`/blog/rss.xml` 有内容 | ✅ 完成（提交 `3bacad2`） |
| **M2** | `BaseLayout` + `Header` + `global.css` + 系统字体栈（放弃网络 CJK 字体） | 有个人风格的静态站 | ✅ 完成（提交 `85d8ef3`） |
| **M3** | ★ `<ClientRouter />` + `transition:persist` + **真实 `<audio>` 实测** | **点导航音乐不断、进度不丢**；失败则切 localStorage 续播 | ✅ **实测通过**（见第 5 节，真实 Edge 154 三段导航） |
| **M4** | 粒子 + 明暗切换（已提前完成）+ 播放器接自托管 mp3 | 移动端自动关闭特效 | ⬜ 待做 |
| **M5** | 自建 Meting API（Cloudflare Workers）+ 切网易云歌单 | 歌单能加载、能播放 | ⬜ 待做 |
| **M6** | GitHub Actions 部署上 GitHub Pages | 线上可访问，内部链接无 404 | ⬜ 待做 |

**M3 关键关卡已通过**：`transition:persist` 对 `<audio>` 实测有效，方案心脏成立。

---

## 11. 风险表

| 风险 | 等级 | 应对 |
|---|---|---|
| `transition:persist` 对 `<audio>` 无官方示例 | 🟢 低（原🔴最高） | **M3 已实测通过**（真实 Edge，前进/后退/再前进三段均保持播放与进度） |
| 公共 Meting API 不稳定 | 🟡 中（原🔴高） | **已实测**：i-meto 的 `type=url` 已坏、injahow 通。结论不变（自建），但已不是猜测 |
| 歌单混入 VIP 歌 → 30 秒试听或直接失败 | 🟡 中（新增） | 运维铁律：歌单**只放免费歌**（实测 VIP 歌 `fee:1` 只有 481,115 字节 / 30.07 秒） |
| 上游 2026 年已切 EAPI 协议，老旧自建端会突然失效 | 🟡 中（新增） | 自建时优先选已适配 EAPI 的项目（`Zxis233/meting-workers`） |
| 网易云接口需登录 cookie | 🟢 低（原🔴高） | **已实测澄清**：免费歌全链路无需 cookie；只有 VIP 需要，而我们不放 VIP |
| GitHub Pages 的 `base` 导致内部链接 404 | 🟡 中 | 统一用 `import.meta.env.BASE_URL` 拼链接 |
| Astro 无现成主题，全部自写 | 🔴 高 | 严格 MVP 排期，特效后置 |
| 特效与"轻量化"目标冲突 | 🟡 中 | 移动端关闭、默认只开粒子 |
| 浏览器禁自动播放 | 🟡 中 | 设计成"点击后播" |
| APlayer 包 4 年未更新（v1.10.1，2022-06-13） | 🟡 中 | CDN 直引、不进 package.json，坏了自己换实现 |
| v7 新大版本 | 🟡 中 | 锁 `astro@7.3.5`；标签必须闭合；注意 `compressHTML:'jsx'` 吃空格 |
| `getImage()` 精确签名未逐字核实 | 🟢 低 | M2 现场用 `astro build` 校准，不行退回 `public/` |

---

## 12. 待办 / 未核实项

- [x] 网易云歌单接口在 2026 年是否仍需 cookie —— **已实测**：免费歌无需 cookie；VIP 歌（`fee:1`）做不到，且只有 30 秒试听
- [x] 公共 Meting API 连通性 —— **已实测**：`api.i-meto.com` 歌单通(200) / `type=url` 全 404；`api.injahow.cn/meting/` 两级全通
- [x] MetingJS 字段契约 —— **已从 APlayer 源码实测确认** `name/title`、`artist/author`、`cover/pic` 互为兜底
- [x] `<audio>` 能否被 `transition:persist` 跨页保留 —— **M3 已实测通过**：元素身份保持、`paused` 恒为 false、时间轴跨交换继续推进（前进/后退/再前进三段全过）
- [x] `transition:persist` 是否必须有 `<ClientRouter />` —— **已从 ClientRouter 打包源码确认**：persist 就是路由器 swap 的一部分，且匹配依据是 `data-astro-transition-persist`
- [ ] MetingJS 属性名的连字符 vs 下划线（`list-folded` 还是 `list_folded`）—— M4 写组件时以本地 `Meting.min.js` 源码为准
- [ ] `getImage()` 的完整签名（`astro-assets.mdx` 两次抓取失败）—— 用到时用 `astro build` 实跑验证
- [ ] `typescript@7.0.2` 与 `astro/tsconfigs/base` 的兼容性（`@astrojs/check` 尚未安装）
- [ ] `<meting-js>` 在 `transition:persist` 容器内的实际行为 —— M4/M5 实测（底层 `<audio>` 已被证明可持久化）

---

## 13. 变更记录

- **v4（2026-10-02）**：**M3 关键关卡实测通过**。用真实 Edge 154（CDP 驱动、真实 `<audio>` 播放）验证 `transition:persist` 对音频有效：三段导航（前进/后退/再前进）元素身份、播放状态、时间轴全部保持。同时从 ClientRouter 打包产物反混淆出 persist 的确切实现（匹配 `data-astro-transition-persist`；优先 `moveBefore()` 原子移动；交换后非持久媒体会被重建），把第 5 节从"预测 + NOT VERIFIED"改为"已确认机制 + 实测数据"，风险表该条 🔴→🟢。M2 记录补全（字体决策、进度）。M0–M3 均已提交。
- **v3（2026-10-02）**：确认 GitHub 用户名为 **emila58035**（`site: https://emila58035.github.io`、`base: '/blog'`）；把 Meting/网易云实测结果并入第 6.5 节并重估风险（cookie 风险 🔴→🟢、公共 API 风险 🔴→🟡）；新增"只放免费歌"与"上游已切 EAPI"两条运维结论。**开始实际搭建**：M0 脚手架已落地并构建通过。
- **v2（2026-10-02）**：按 6 条批注修正 —— 移除评论功能（Giscus 从方案与依赖中删除）；托管从 Cloudflare Pages 改为 **GitHub Pages**（新增 `base` 配置与官方 workflow，新增 base 链接坑与规避办法）；音乐源改为**网易云歌单**并新增第 6 节原理说明；确认 MVP 特效范围；本文档落盘。
- **v1（2026-10-02）**：初版。三份官方文档核实结果（View Transitions / 样式与脚本 / 内容集合与依赖版本）已并入。
