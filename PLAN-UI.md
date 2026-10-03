# 方案 v10 · 外观与功能优化

> 本文是 `PLAN.md` 的续篇（主文档记录 M0–M6 建造过程，本文记录上线后的优化阶段）。
> 状态：**待确认，尚未开工**。确认后按第 8 节的里程碑逐步实施。

## 1. 本轮目标

在已上线的 <https://emila58035.github.io/blog/> 上优化外观与功能，共 7 项：

| # | 项目 | 归属 |
|---|---|---|
| 1 | 播放器加歌单浏览（可滚动面板，当前曲自动滚入视野） | 播放器 |
| 2 | 播放器加音量控制（小喇叭按钮 + 竖向滑条） | 播放器 |
| 3 | 播放器鼠标不悬停时缩成 3rem 圆形按钮、贴屏幕边缘 | 播放器 |
| 4 | 首页首图 Hero 区（收在内容栏内，高度约 40vh） | 外观 |
| 5 | 首页卡片式文章列表（支持可选封面图） | 外观 |
| 6 | 文章页：目录（TOC）+ 阅读时长/字数 + 图片灯箱 | 功能 |
| 7 | 顶栏在 Hero 上方透明（白字），滚过 Hero 后变回毛玻璃 | 外观 |

**明确不做**：站内搜索（用户 m01655 决定删除，Pagefind 与相关入口全部不做）。

## 2. 已确定的设计决策

| 决策点 | 选择 |
|---|---|
| 播放器自动隐藏 | 鼠标不悬停 → 缩成 **3rem 圆形按钮**（带唱片/动态效果）；悬停 → 展开为完整 dock |
| 歌单面板 | **向上展开**的可滚动列表面板；只做滚动 + 当前曲自动滚入视野，**不做搜索** |
| 音量 | dock 内一个**小喇叭按钮**，点开才弹出**竖向滑条**；音量值写入 localStorage |
| Hero | **真实图片**，收在 44rem 内容栏内、高约 40vh |
| 顶栏 | Hero 上方透明 + 白字；滚过 Hero 后恢复毛玻璃与常规配色 |
| 图片存放 | **`src/assets/`**，按文件名引用，交给 Astro 构建期优化 |
| 文章封面 | **可选**：frontmatter 写 `cover` 才显示，不写则用渐变占位 |
| 灯箱 | 打开/关闭 + 键盘操作（Esc / ←→）+ 多图切换 |
| TOC | 自动生成，移动端折叠 |

## 3. 必须记住的一条既有约束（与主文档第 5 节呼应）

播放器能跨页不断歌，靠的是三件事同时成立：

1. `transition:persist="player"` **打在整个 `.player-dock` 根节点上**，不能只打在 `<audio>` 上（只持久音频会让按钮与进度条被新页替换、监听丢失、控件失效 —— M4 踩过这个坑）；
2. 每个页面都要 SSR 渲染出这个元素（它在 `BaseLayout` 里，所以自动满足）；
3. 初始化脚本用 `dock.dataset.ready` 守卫，只绑定一次事件。

本轮所有播放器改动都**不得破坏这三条**。新增的面板、音量滑条在 DOM 上属于 dock 的子元素，随 dock 一起被原子搬运，事件监听自然保留。

## 4. 布局锚定问题 —— 实测后已排除（原假设有误）

> **⚠️ 2026-10-02 更正（U1 实测）**：本节原判断"`moveBefore()` 会把 fixed 元素降级成绝对定位、需要把 dock 提升到 body 并改用全局样式"，**在真实浏览器里不成立**。下面保留原推理过程作为记录，但**结论已作废**；实测数据见第 8 节 U1。

**原假设（已作废）**：要"缩到屏幕边缘"，视觉上必须用 `position: fixed`，而 `<ClientRouter />` 交换 body 时会把持久元素用 `documentElement.moveBefore()` 原子搬到新 body，`moveBefore()` 对已在文档中"布局锚定"的 fixed 元素会把它降级成绝对定位。

**实测结论（2026-10-02，Edge 154.0.4258.48 headless + `astro preview`）**：

- `typeof document.documentElement.moveBefore === 'function'` → `true`（确实走原子移动路径）；
- **但 dock 的 `parentElement` 本来就是 `BODY`** —— `<Player />` 在 `BaseLayout.astro` 里位于 `</main>`、`<Footer />` 之后，是 `<body>` 的最后一个子元素。也就是说搬动发生在 **documentElement 层**（`i.appendChild(a)`，`i = newDocument.documentElement`），子元素本身没有被"重新锚定"到别的包含块里；
- `astro:after-swap` 事件里**同步**采样（不是等 1.4 秒后），三次导航全部为 `pos: fixed`、`left: 16`、`gap: 16`、同一个随机戳、`paused: false`、`currentTime` 单调递增。

**因此本轮不需要任何"节点提升"代码**：不 `document.body.appendChild`、不改 `is:global`、不加 `html[data-player='ready']` 的内联样式钩子。原方案里的这一整块是过度设计。

**真正的约束（U2–U4 仍然适用）**：
- 新增的面板 / 音量滑条必须是 dock 的**子元素**，这样它们随 dock 一起被搬运，监听器自然保留；
- **`overflow` 与裁剪**：dock 若设 `overflow: hidden`，向上的面板和音量滑条会被裁掉 —— 面板必须挂在 dock 内但**不被 dock 的裁剪影响**（用绝对定位 + dock 不设 hidden，或把面板做成独立浮层）；
- **自动收纳与已打开浮层的互斥**：鼠标移开时若正在展开面板/音量条，**禁止**收纳。

## 5. 代码改动清单

### 5.1 `src/components/Player.astro`（改动最大）

**结构与状态机**

```
默认（鼠标不在上面）：.player-dock 缩到 3rem 圆形按钮，贴左下角
      ↓ 悬停 / focus / 面板已打开
展开：完整 dock（播放键 + 歌名/歌手 + 进度条 + 时间 + 上一首/下一首 + 音量 + 歌单按钮）
      ↓ 点歌单按钮
展开 + 歌单面板向上弹出（可滚动列表，当前曲高亮并自动滚入视野）
      ↓ 点音量按钮
展开 + 竖向音量滑条弹出
```

**折叠形态的细节（我建议的做法，可再改）**

- 圆钮上叠一圈 **SVG `stroke-dasharray` 进度环**，暂停时进度环变暗 —— 缩起时也知道在放哪首歌的哪个位置；
- 正在播放时圆钮上的唱片纹路匀速旋转（`@keyframes player-spin 6s linear infinite`），暂停时用 `animation-play-state: paused` 停在当前角度；
- 带歌名/歌手的 `title` 提示（原生 tooltip，零成本）。

**⚠️ 一个必须一起处理的副作用：首屏闪烁**

把 `position: fixed` 交给 JS 设置，会导致每次整页加载时 dock 先按 `absolute` 渲染一帧、再由 JS 提升 → 肉眼看到一次跳动。主文档第 7-② 节的主题闪烁就是这个类别的问题。

处理办法：在 `BaseLayout` 的 `<head>` 里那段已有的 `is:inline` 脚本中，**同步加一个类**（例如 `document.documentElement.dataset.player = 'ready'`），配合 CSS `html[data-player='ready'] .player-dock { position: fixed; }`，让 fixed 在**首帧之前**就生效，JS 只负责提升节点到 body。这样既没有闪烁，又不依赖 scoped 样式。

**音量实现要注意的一点**

音量值写入 `localStorage`（键建议 `player.volume`）。恢复时**不要**在提升 `AudioContext` 之前写 `audio.volume`。初次用户手势后才第一次写音量，避免自动播放策略下"音量被静默重置"的迷惑行为。具体做法：初始化时就设 `audio.volume = saved`，并在用户首次点击播放后再校正一次。

**持久化的新状态**

折叠/展开状态也写入 localStorage（键建议 `player.collapsed`），这样切页回来不会"又展开一次"。

### 5.2 首页 `src/pages/index.astro` + 新增组件

- 新增 `src/components/home/Hero.astro`：`src/assets/` 读图（`import` + `<Image>`），收在内容栏内、高约 40vh，上叠标题与副标题；
- 新增 `src/components/home/PostCard.astro`：封面图（可选）+ 标题 + 描述 + 日期 + 标签；
- 首页改为**卡片列**：**每行一列**（用户 m01675 定），卡片占满内容栏宽度，封面图为宽幅横向裁切。

**✅ 实际实现（U5 已完成，细节见下方「★ U5 实测结果」）**

| 项 | 落地的值 | 与方案原文的差异 |
| --- | --- | --- |
| Hero 比例 | `aspect-ratio: 2.2 / 1` + `max-height: 40vh` | 原写「高约 40vh」；实测桌面 664×302（约 33.6vh） |
| Hero 裁切 | `object-fit: cover` + `object-position: center top` | 新增：把原图底部的作者署名裁掉 |
| Hero 宽度 | 显式 `width: 100%` | 新增：只给 `aspect-ratio` + `min-height` 会横向溢出 |
| 卡片封面 | `aspect-ratio: 16 / 9` | 同原方案 |
| 内容 schema | `schema: ({ image }) => z.object({ … cover: image().optional(), coverAlt: z.string().optional() })` | 原写 `cover: z.string()`；改成函数式 schema 才能让 frontmatter 直接写相对图片路径 |
| 死代码 | 删掉 `src/styles/global.css` 里的 `.post-list` / `.entry-time` 整块 | 首页改用卡片后无人引用 |

**卡片在有/无封面图时的两种形态（这是用户 m01690 问的，已定）**

```
【有 cover】                      【无 cover，默认 B1】
┌──────────────────────┐         ┌──────────────────────┐
│   封面图 16:9 裁切     │         │  渐变占位块 同一高度   │
├──────────────────────┤         ├──────────────────────┤
│ 2026-09-28           │         │ 2026-09-28           │
│ 文章标题              │         │ 文章标题              │
│ 描述文字…             │         │ 描述文字…             │
│ #标签 #标签           │         │ #标签 #标签           │
└──────────────────────┘         └──────────────────────┘
```

- 两种形态**高度一致**：封面区固定 `aspect-ratio: 16 / 9`、`object-fit: cover`，所以封面无论是 2:1 还是 3:2 都不会把卡片撑变形，同一列里卡片对齐。
- 占位块用 `linear-gradient` 从 `--accent` 渐到 `--accent-soft`（两个变量 `global.css` 里已有，且跟随深浅色主题自动变），**不写数据就不显示图**，页面不会因为缺图而报错或留空洞。
- 备选 **B2（更紧凑）**：无 cover 的卡片整个不渲染封面区，卡片比有图者矮、列表更密。代价是同一列里卡片高度不齐。
- 备选 **B3（占位 + 字标）**：B1 的渐变块上叠一个低调的字标（日期或标题首字）。视觉不空，但没有真实图时仍略显"占位感"。

> **✅ 已定（用户 m01710）：走 B2。** 无 `cover` 的文章不渲染封面区，不占位；B1 与 B3 作废。

**图片走 Astro 的图片管线**（依赖里已有 `sharp@0.35.5`）：构建期转 WebP/AVIF 并生成多档宽度，本地不会因为大图而变慢。**这一步会直接拉长构建时间**，需要实测。

### 5.3 文章页 `src/pages/posts/[...id].astro`

- **TOC**：`const { Content, headings } = await render(post);` —— `headings` 已是现成数据，无需额外插件。移动端折叠用一个 `<details>` 或按钮切换；
- **阅读时长/字数**：用 `post.body` 估算（需扣掉代码块与 frontmatter 再数，否则代码多的文章会虚高）；
- **灯箱**：新增 `src/components/ImageLightbox.astro`，用原生 `<dialog>`，`Esc` 关闭、`←/→` 切换、点击背景关闭。**不引第三方库。**

**✅ 实际实现（U6 已完成）**

| 项 | 落地位置 | 做法 |
|---|---|---|
| 目录 | 新增 `src/components/TableOfContents.astro` | `<details data-toc>` + `<summary>目录</summary>` + `<ol>`；只收 `depth === 2 \|\| depth === 3`，少于两条不渲染；`<script>` 监听 `astro:page-load`，按 `(min-width: 48rem)` 决定默认开合 |
| 阅读时长 | 新增 `src/utils/reading.ts` | `readingMinutes(markdown: string): number`，中文 350 字/分 + 西文 200 词/分，剥掉 frontmatter／围栏代码块／行内代码／图片链接地址后计数 |
| 灯箱 | 新增 `src/components/ImageLightbox.astro` | 空壳 `<dialog>`；脚本在模块顶层注册一次 document 级点击委托，现场收集 `.prose img` 作相册 |
| 顶栏让位 | `src/styles/global.css` | `.prose :is(h2, h3, h4) { scroll-margin-top: 4.5rem; }` |

- `src/pages/posts/[...id].astro` 的改动：`const { Content, headings } = await render(post);`；`const minutes = readingMinutes(post.body ?? '');`；meta 行加 `<span>约 {minutes} 分钟</span>`；`</header>` 之后插 `<TableOfContents headings={headings} />`；`</article>` 之后插 `<ImageLightbox />`。
- **TOC 锚点不需要特殊处理**：`node_modules/astro/dist/transitions/router.js` 里 `samePage()` 只比 `pathname` + `search`，同页 hash 链接走 `moveToLocation()`，最终 `location.href = to.href` 交给浏览器原生片段导航。
- **灯箱只接管 `.prose` 里的裸图**：`target.closest('a')` 为真时放行，被链接包住的图仍走原链接。

### 5.4 顶栏 `src/components/Header.astro`

- 检测当前页是否存在 Hero 元素（`document.querySelector('[data-hero]')`）；
- 有 Hero → 初始加透明态类（透明底 + 白字 + 去掉 `border-bottom`）；
- 用 `IntersectionObserver` 观察 Hero，滚过之后切回现有的毛玻璃态。

**这里有一个必须遵守的既有约束**：主题恢复脚本依赖 `astro:before-swap` 把 `data-theme` 同步到 `event.newDocument.documentElement`。新增的顶栏透明态逻辑**不要**放进每个页面各自的脚本里（客户端导航后不会重跑），要么放进 `BaseLayout` 的那段 `is:inline` 脚本，要么监听 `astro:page-load`。

## 6. 图片与用户需要准备的东西

| 项 | 说明 | 建议规格 |
|---|---|---|
| Hero 首图 | 放 `src/assets/`，我按文件名引用 | 横构图，≥1400×700；因收在内容栏内，不必很宽 |
| 文章封面（可选） | 每篇可选，frontmatter 写 `cover:` | 16:9 或 3:2 皆可，卡片会裁切 |

**已收到的文件**：

| 文件 | 实际尺寸 | 大小 | 用途 |
|---|---|---|---|
| `src/assets/133284436_p0.jpg` | 2932×1429（≈2.05:1） | 802 KB | Hero 首图（用户 m01673 提供） |

> 交接方式：你把文件放进 `src/assets/`（或告诉我文件名），我改引用即可。**在你放图之前，页面会显示渐变占位**，不会报错。

## 7. 风险与待验证项

| 项 | 等级 | 说明 |
|---|---|---|
| ~~`moveBefore()` 与 fixed 定位的交互~~ | ⚪ 已排除 | **U1 实测证伪**：dock 本就是 `<body>` 直属子元素，三次导航（含 `astro:after-swap` 同步采样）`position` 恒为 `fixed`、盒子恒为 `left:16 / gap:16`。不需要任何提升代码 |
| ~~提升节点后 scoped 样式失效~~ | ⚪ 已排除 | 同上，不做提升就不会有这个问题 |
| ~~首帧 fixed 闪烁~~ | ⚪ 已排除 | `position: fixed` 现在由组件 scoped CSS 承担，SSR 直出，首帧即 fixed，无需 JS 介入 |
| Hero 大图拉长构建时间 | 🟡 中 | Astro 图片管线会为每个引用生成多档尺寸；需实测本地与 CI 构建耗时 |
| 面板 + 圆钮 + 音量滑条三者叠加的交互冲突 | 🟡 中 | 悬停展开与"点开的滑条/面板"必须互斥，否则鼠标移开会把面板一起收走。需明确：**面板或滑条打开时禁止自动收纳** |
| dock 的裁剪会切掉向上的浮层 | 🟡 中 | dock 一旦设 `overflow: hidden`，向上展开的面板/音量条会被裁掉；实现时必须让浮层不受 dock 裁剪影响 |
| `cover` 字段类型变更 | 🟢 低 | 现有 schema 里 `cover: z.string().optional()` 尚未被使用；改成 content collections 的 `image()` 后类型变化，需确认无别处引用 |
| TOC 与长文锚点跳转 | 🟢 低 | `headings` 已提供 `depth/slug/text`；需确认锚点 id 在 v7 的 Sätteri 管线里确实生成 |
| 灯箱与客户端导航共存 | 🟢 低 | `<dialog>` 在 `astro:after-swap` 前会被替换掉，需在 `astro:page-load` 里重新绑定或把灯箱做成持久元素 |

**待验证清单（开工后逐条实测，不靠推断）**：
1. ~~`moveBefore` 后 `getBoundingClientRect()` 是否仍相对视口（三次导航 + 滚动）~~ → **已实测，结论见 U1**；
2. ~~提升到 body 后 dock 的 `backdrop-filter`、圆角、层级是否正常~~ → **不需要提升，作废**；
3. `astro:page-load` 里 `header` 透明态的初始判定是否正确（首屏不闪白字/黑字）；
4. Astro content collections 的 `image()` 在 7.3.5 的确切导入方式与返回类型；
5. 大图加入后构建耗时与产物体积（对照当前 10 页零图片的基线）。

## 8. 里程碑

| # | 内容 | 验收标准 | 状态 |
|---|---|---|---|
| U1 | 播放器：验证 fixed 定位能否扛住客户端导航（原计划改代码，实测后改为纯验证） | 三次导航后位置不飘、跨页不断歌仍成立 | ✅ **已完成，零代码改动** |
| U2 | 音量按钮 + 竖向滑条 | 音量生效并持久化；刷新后保持；不影响自动播放策略 | ✅ **已完成，12/12 通过** |
| U3 | 歌单面板 | 78 首可滚动；当前曲高亮且自动滚入视野；点击即切歌；面板打开时不被自动收纳 | ✅ **已完成，22/22 通过** |
| U4 | 自动收纳成 3.1rem 圆钮 | 悬停展开/移开收起；进度环反映播放进度；切页后状态保持 | ✅ **已完成，20/20 通过（含 U2/U3 回归 8/8）** |
| U5 | 首页 Hero + 卡片列表 | 无 cover 的文章走 B2（不占位）；40vh 与内容栏对齐；移动端不塌 | ✅ **已完成**；`image()` schema 与带 cover 卡片已实测 |
| U6 | 文章页：TOC + 阅读时长 + 灯箱 | 锚点跳转正确；移动端 TOC 可折叠；灯箱键盘操作与多图切换可用 | ✅ **已完成，24/24 通过** |
| U7 | 顶栏透明过渡 | 首页首屏为透明白字；滚过 Hero 后变毛玻璃；其他页面始终毛玻璃 | ⬜ |
| U8 | 图片接入 + 全量验收 | 构建耗时与体积可接受；线上真实浏览器复跑全部验收 | ⬜ |

**每个里程碑都用真实 Edge（CDP 驱动）验证后再提交**，沿用既有做法：提交信息用中文，git 版本控制，不使用过度防御性编程。

### ★ U1 实测结果（2026-10-02，Edge 154.0.4258.48 headless + `astro preview --port 4321`）

驱动脚本：`_audit/u1-measure.cjs`、`_audit/u1-verify.cjs`（CDP，只读测量；Edge 由 pwsh 后台任务单独启动，Node 只连 CDP）。

基础环境：
- `typeof document.documentElement.moveBefore === 'function'` → **true**（确实具备原子移动能力，走的是 `moveBefore` 分支而非 `appendChild`）。

三次客户端导航（点击站内链接，非整页刷新），每次都在 `astro:after-swap` 事件里**同步采样**（不等页面稳定）：

| 导航 | parent | position | left | bottom gap | 节点戳 | paused | currentTime |
|---|---|---|---|---|---|---|---|
| 初始首页 | BODY | fixed | 16 | 16 | `u1-q2de30` | false | 2.225 |
| → `/blog/archive/` | BODY | fixed | 16 | 16 | `u1-q2de30` | false | 3.642 |
| → `/blog/about/` | BODY | fixed | 16 | 16 | `u1-q2de30` | false | 5.046 |
| → 回 `/blog/` | BODY | fixed | 16 | 16 | `u1-q2de30` | false | 6.452 |

- 三次 verdict 全部 `sameNode: true` / `stillFixed: true` / `sameBox: true` / `stillPlaying: true` / `timelineAdvanced: true`；
- `astro:after-swap` 时点采样同样为 `pos: fixed`、`left: 16`、`gap: 16` —— **说明交换过程中没有被降级**；
- 滚动对照：`window.scrollTo(0, 600)` 后 `bottomGap` 保持 16（fixed 行为正确）；
- `audio.error = null`、`readyState = 4`、无控制台异常。

**结论**：`<Player />` 已经是 `<body>` 的最后一个子元素，`ClientRouter` 的搬动发生在 documentElement 层，`position: fixed` 全程稳定。**U1 不需要任何代码改动**，原方案第 4 节的"提升节点 + 全局样式 + 首帧钩子"全部取消。

### ★ U2 实测结果（2026-10-02，同一套 CDP 环境）

驱动脚本：`_audit/u2-verify.cjs`（验收）、`_audit/u2-shot.cjs`（截图）、`_audit/u2-diag.cjs`（几何诊断）。

**实现要点**
- 音量真相只有一份：用 `Object.defineProperty` 接管 `audio.volume`，getter/setter 映射到一个闭包变量 `volume`，**任何赋值路径都会自动写回 localStorage**（新增字段 `SavedState.volume`）。
- 滑条用**原生 `<input type="range">` 旋转 `-90deg`** 做成竖向，而不是自绘指针事件 —— 键盘方向键、拖动、屏幕阅读器语义全部保持原生行为。
- 浮层挂在 **dock** 上（`.player-volume-pop` 是 dock 的绝对定位子元素），**不是**挂在 1.5rem 宽的喇叭按钮上。
- 收起/展开用 `hidden` 属性 + `:has([data-player-volume][aria-expanded='true'])` 控制 `pointer-events`/`opacity`。收起时 `hidden` 使 `display:none`，`getBoundingClientRect()` 返回全 0，因此 `pointer-events: none` 是实际生效的守卫（不是只有声明）。

**★ 踩到的坑（后来者注意）**：浮层最初挂在喇叭按钮上、用 `bottom: calc(100% + 0.45rem)` 抬高。因为滑条旋转 90° 后**「视觉高度 = 原始 inline-size」**，以按钮为基准只抬高了滑条本体的高度（约 30px），而旋转后的视觉高度是 112px —— **浮层下沿压进 dock 里 52px**。改为以 dock 为定位基准后，浮层盒子为 `top:775 / bottom:816`，而 dock 为 `top:823` → **完全在 dock 上方，不再重叠**。

**验收数据（12/12 通过）**

| 检查 | 结果 |
|---|---|
| 收起时 `hidden` | true |
| 收起时不可点击（`pointer-events: none`） | true |
| 展开时 `pointer-events: auto` + `opacity: 1` | true |
| 滑条是竖向（`rangeBox 20×96`） | true |
| 浮层完全在 dock 上方（`popAboveDock`） | true |
| 设为 0.35 后 `audio.volume` | 0.35 |
| 范围输入与音量同步（`rangeValue`） | 0.35 |
| 播放中音量保持 | 0.35 |
| 客户端导航后音量保持 | 0.35 |
| 导航后仍是同一节点（持久化未破坏） | true |
| 整页刷新后从 localStorage 恢复 | 0.35 |
| 刷新后范围输入同步 | 0.35 |
| 控制台异常 | `[]` |

**小屏调整**：`@media (max-width: 30rem)` 下隐藏 `.player-volume` 与 `.player-btn-sm`，只留播放键 + 进度条，避免 dock 过窄时按钮挤成一团（原有的"隐藏时间文字"保留）。

### ★ U3 实测结果（2026-10-02，同一套 CDP 环境）

驱动脚本：`_audit/u3-verify.cjs`（验收，21 项）、`_audit/u3-style.cjs`（样式是否真的生效）、`_audit/u3-debug2.cjs`（复刻时序定位问题）。

**实现要点**
- 面板是 `<div class="player-playlist" data-player-panel hidden>`，挂在 dock 下、`bottom: calc(100% + 0.5rem)` 向上展开；`max-height: min(20rem, 60vh)`，自己管 `overflow-y: auto`（**dock 不能设 `overflow: hidden`，会连面板一起裁掉**）。
- 列表项内容由 `buildPanel()` 用 `innerHTML` 生成（78 项），点击用**事件委托**挂在 panel 上 —— 面板内容会被整体重建，挂在单项上的监听会随之消失。
- 点 dock 之外才收起；`Esc` 收起；打开时 `syncActive()` 把当前曲高亮并把 `scrollTop` 调到该项可见。

**★ 踩到的两个坑（都是"普通构建不报错、只有真看页面才发现"）**

1. **Astro scoped 样式对 JS 生成的节点静默失效。** 一开始用 `document.createElement()` 造列表项，但 `.player-playlist-item` 写在组件的 scoped `<style>` 里，编译后选择器是 `.player-playlist-item[data-astro-cid-g2mknjow]`；`data-astro-cid-*` **只有编译器渲染 `.astro` 模板 HTML 时才会写上**，JS 造出来的节点没有这个属性 → 13 条规则全部不匹配，面板渲染成一堆浏览器默认样式的按钮、条目互相挤在一起。**DOM 断言（`hidden`、`children.length`、`scrollTop`）全都通过，只有截图暴露了问题。**
   - 修法：这一组选择器移到 `<style is:global>`（见文件末尾的说明注释）。以后凡是"JS 生成节点再套样式"，都要放全局块或给元素补 `[data-astro-cid-xxx]`。
   - 教训：**结构化验收 + 数值断言不能代替看一眼真实渲染**。
2. **`panel.contains(target)` 判外点不可靠。** 点列表项会走 `load() → buildPanel() → replaceChildren()/innerHTML`，等事件冒泡到 `document` 时被点的那个按钮已经被摘掉，`contains()` 返回 false → **每挑一首歌面板就关一次**。改用 `event.composedPath()`（记录事件派发那一刻的路径，元素已移除也有效），并且判定范围是整个 **dock** 而不是"面板 + 列表按钮"，否则点播放键/切歌键也会顺手关掉面板。

**验收数据（21/21 通过）**

| 检查 | 结果 |
|---|---|
| 面板初始收起 / 已渲染 78 项 | true / 78 |
| 点按钮展开、`aria-expanded` 同步 | true |
| 面板完全在 dock 上方（`pop.t=396 b=716`，`dock.t=723`） | true |
| 面板自身可滚动 | true |
| 第 1 首高亮且 `scrollTop` 为 0 | true |
| 点播放键**不会**收起面板 | true |
| 点第 60 项即切歌、标题同步 | `Camelia` / true |
| 选曲后面板保持打开 + 高亮 + 已滚入视野 | true（`scrollTop 2204`） |
| 点外部收起 / `Esc` 收起 | true / true |
| 客户端导航后仍是同一 dock 节点 | true |
| 导航后歌曲继续播放 | 3.94s → 6.16s |
| 导航后面板收起但列表完整（78 项） | true |
| 导航后重开面板仍高亮且滚到当前曲 | true |
| 导航后点列表仍能切歌 | `天球の下の奇蹟` |
| 鼠标移开后不自动收纳 | true |
| 音量浮层层级高于面板（`popZ 2 > panelZ 1`） | true |
| 控制台异常 / HTTP 错误 | `[]` / `[]` |

> 测试隔离的经验：`localStorage` 里残留的 `player.state` 会让"第 1 首高亮"这类断言随机失败。脚本现在先导航到 `http://localhost:4321/`（同源但**不是**站点根路径，Astro 不加载、播放器不初始化）再 `localStorage.clear()`，然后才进 `/blog/`。

（补记：后来加了一条 computed style 断言专门防上面第 1 个坑复发，取样式时要挑 `[data-active="false"]` 的项 —— 当前曲本来就有 accent 底色。最终 **22/22**。）

### ★ U4 实测结果（2026-10-02，同一套 CDP 环境）

驱动脚本：`_audit/u4-verify.cjs`（验收 20 项）、`_audit/u4-regress.cjs`（U2/U3 回归 8 项）。

**实现要点**
- 收起态由 dock 上的 `data-collapsed` 属性驱动：`.player-dock[data-collapsed='true']` 变 `3.1rem` 正方形、`border-radius: 50%`、`padding: 0`。
- **进度环用 dock 的 `::after` + `conic-gradient` + 环形 `mask`**，不需要额外 DOM。`conic-gradient` 不认百分比，所以脚本在 `paint()` 里写 `--player-progress: ${pct * 3.6}deg`；暂停时环停在当前位置。
- 播放键在收起态撑满整圆（`width/height: 100%`），整圆可点。
- **dock 绝不能加 `overflow: hidden`**：歌单面板与音量浮层都是从 dock 上沿往上弹的绝对定位子元素，会被一起裁掉。收窄内容的活交给 `.player-body` / `.player-right` 各自的 `width: 0; overflow: hidden; opacity: 0`。
- **`.player-body` / `.player-right` 展开时的淡入加了 100ms 延迟**（`transition: opacity 80ms ease 100ms`），否则文字会在还没撑开的窄壳子里闪一下。
- 收纳逻辑只在 `(hover: hover) and (pointer: fine)` 下生效 —— 触摸屏没有"移开鼠标"这回事，收起来就点不回去了。
- 计时 4 秒；**`busy()` 期间不收纳**：鼠标在 dock 上、焦点在 dock 内、歌单面板开着、音量浮层开着，任一成立就跳过。打开面板/浮层时反过来强制 `expandDock()`，保证"有东西开着就一定是展开态"。
- 键盘 `focusin` 也展开，否则 Tab 进去的焦点落在了摸不到的地方。

**★ 唱片纹理（U5 阶段按用户批注补做）**
- 需求变更：原本只做了进度环的 2.4s 呼吸动画，用户批注「改成唱片纹理」。
- 实现：纹路做在**播放键按钮**的 `::before` 上（收起态才生效），三层 background 自上而下——
  1. `linear-gradient(118deg, transparent 40%, rgb(255 255 255 / 26%) 50%, transparent 60%)`：偏心高光，**压在最上层**；
  2. `radial-gradient(circle at 50% 50%, rgb(255 255 255 / 16%) 0 15px, transparent 15px)`：唱片中心的标签面，播放/暂停图标正好落在上面；
  3. `repeating-radial-gradient(circle at 50% 50%, transparent 0 3px, rgb(0 0 0 / 15%) 3px 4px)`：同心细沟。
- `inset: -25%` 让纹路层比按钮大一圈，旋转时四角不外露；按钮上加 `overflow: hidden` 把纹路裁进圆里（**注意这是加在播放键上，不是 dock 上**，dock 的 `overflow: visible` 必须保留）。
- 动画 `.player-spin 6s linear infinite`，**用 `animation-play-state` 控制**：未播放时 `paused`（角度定格，不会归零），`[data-playing='true']` 时 `running`。整体包在 `@media (prefers-reduced-motion: no-preference)` 里，减少动效的用户看到的是静止的纹路。
- **★ 两个只有看图才发现的问题**：
  1. 沟槽渐变若从 `0 1px` 起手，**正中心会落下一个 1px 的深色圆点**（`repeating-radial-gradient` 的第一圈是个实心小圆）。改成 `transparent 0 3px, rgb(0 0 0 / 15%) 3px 4px` 起手留白即可。
  2. **纯同心圆是旋转对称的，转起来完全看不出在动** —— 必须有那个偏心高光（或偏心标签）才能读出旋转。这是做"唱片转动"这类效果的关键，不是可选装饰。
- 验收：`_audit/u5-regress.cjs` **26/26 通过**（含展开态几何 368×61/左16、正文与右侧 160/128、播放键 34、gap 11.2px；面板 78 项且样式生效、完全在 dock 上方、可滚动、点播放键不关面板、点列表切歌面板不关；音量浮层 `bottom 716 ≤ dock.top 723`、`z-index 2 > 1`、滑条 20×96；收起态 50×50/圆角 50%/左 16、正文与右侧 0/0、播放键 48、三层纹理齐全、`overflow: hidden` + `position: relative`、进度环仍在；暂停时 `::before` 的变换矩阵定格、播放时矩阵在变且 `animation-play-state: running`；客户端导航后同一节点、仍在播放、纹路与进度环正常；无脚本错误、无 4xx/5xx）。
- **★ 验收方法上的教训**：背景有飘动的粒子，**像素级截图比对会被它污染**，证明"在转"不能靠两张截图不同。改读 `getComputedStyle(el, '::before').transform` 的矩阵 —— 暂停时两次必须完全一致，播放时两次必须不同。另：`animation-name` / `animation-play-state` 在**展开态会回落到初始值**（`none` / `running`，因为选择器不匹配了），所以不能在外面读，必须在收起态读。

**★ 截图暴露的坑：收起态忘了清 `gap`。** `.player-body` / `.player-right` 收成 0 宽之后，flex 容器里那两道 `0.7rem` 的 `gap` 仍然占位，内容总宽超过圆钮，`justify-content: center` 一居中就把播放键挤到了圆钮左外侧 —— 截图里是一个蓝圆偏在白色圆钮左边的怪样子。**19 项数值断言全部通过，只有看图才发现。** 修法：收起态加 `gap: 0`。（又一次印证 U3 的教训：**结构化验收不能代替看一眼真实渲染**。）

**验收数据（20/20 通过）**

| 检查 | 结果 |
|---|---|
| 环境支持悬停 | `hover: true` / `pointer: fine: true` |
| 初始为展开态、且 dock 无 `overflow: hidden` | 368px / `visible` |
| 静置 4 秒后自动收纳 | `collapsed: true` |
| 收纳后是 3.1rem 正方形圆钮、仍在左下角 | 50×50、`border-radius: 50%`、left 16 / bottom 16 |
| 正文与右侧控件收掉 | 宽度 0 / 0，透明度 0 / 0 |
| 播放键撑满整圆 | 48 / 50 |
| 进度环由 `::after` 的 conic-gradient + 环形 mask 生成 | true |
| 悬停展开回长条 | 368px，正文透明度 1 |
| 移开后再次收纳 | true |
| 播放中进度环角度增长 | 2.39deg（播放 2.2s） |
| 暂停后进度环停在 38% | 136.8deg |
| 歌单面板开着时**不**收纳，关掉后重新计时并收纳 | true / true |
| 音量浮层开着时**不**收纳 | true |
| 键盘 Tab 聚焦时展开 | true |
| 客户端导航后收纳逻辑仍生效 | `/blog/archive/` 上进入展开、离开收纳 |
| 控制台异常 | `[]` |

**U2/U3 回归（8/8 通过）**：展开态几何与改动前完全一致（368×61、左 16、`gap` 11.2px、播放键 34px）；正文/右侧控件宽度与透明度正常；歌单面板仍能展开、完全在 dock 上方、列表项的 `is:global` 样式仍生效；点列表项切歌且面板不关；音量浮层仍在 dock 上方（`pop.bottom 716 ≤ dock.top 723`）；收纳后再展开时当前曲高亮等状态完整保留。

> 回归里有一条一开始 FAIL 是**测试自己的错**：没先关掉音量浮层就去等收纳，而"浮层开着不收纳"正是要被验证的行为。

### ★ U5 实测结果（2026-10-02，同一套 CDP 环境）

**改动清单**：新增 `src/components/home/Hero.astro`、`src/components/home/PostCard.astro`；改写 `src/pages/index.astro`（Hero + `.post-cards` 网格）；`src/content.config.ts` 的 schema 改成函数式并启用 `image()`；删掉 `src/styles/global.css` 里已成死代码的 `.post-list` / `.entry-time`。

**★ 三道只有实测才会暴露的坎**

1. **只给 `aspect-ratio` + `min-height`，宽度会被 `min-height` 反过来撑大 → 横向溢出。**
   初版 `.hero` 写了 `aspect-ratio: 21 / 9; min-height: 10rem;`，375px 视口下实测 `getComputedStyle(hero).width === "373.328px"`，而它所在的 `main` 内容盒只有 335px（`main` 是 `max-width: 44rem; padding-inline: 1.25rem; box-sizing: border-box`）。`document.documentElement.scrollWidth` 从 375 变成 393，页面横向可滚。
   成因：`min-height` 成了确定高度，浏览器用比例**反推宽度**（160 × 21/9 = 373.33）。
   修法：`.hero` 显式写 `width: 100%`，把宽度钉死，比例只能驱动高度。改完 `overflowX: false`。

2. **`aspect-ratio` 只有比原图更"宽"时才会纵向裁切，而这决定了原图底部的作者署名露不露。**
   原图 `src/assets/133284436_p0.jpg` 是 2932×1429（比例 **2.0518**）。用 Python/PIL 扫左下角（x 1%–30%）的亮像素，实测署名 `MUDDY-MOOD` 占 **y = 1372..1409，即高度的 96.0%–98.6%**。
   - 容器比例 **2/1 = 2.0 < 2.0518** → 图更宽，`cover` 按高度铺满，**只裁左右两侧**，整条署名留在画面最下沿被切一半，很难看；
   - 容器比例 **2.2** → 纵向裁切，配 `object-position: center top` 把裁切全放到底部，可视窗口底边 = 2.0518 / 2.2 = **93.3% < 96.0%**，署名被裁掉。
   所以最终取 `aspect-ratio: 2.2 / 1`，透明水印问题在桌面与移动端同时解决。

3. **`<Image>` 渲染出的 `<img>` 不一定带 scoped 属性**（它是别的组件渲染的节点），`.hero img { }` 这类选择器可能匹配不上。统一写成 `.hero :global(img)` / `.post-card-cover :global(img)`。

**实测数据**

| 项 | 桌面 1100×900 | 移动 375×780 |
| --- | --- | --- |
| Hero | 664×302（占视口高 33.6%） | 335×152 |
| 内容栏 | main 704（内容盒 664） | 335 |
| 卡片宽度 | 664，间距 24 | 335，间距 24 |
| 无 cover 卡片高 | 172 | 196 |
| 横向溢出 | 无 | 无 |
| `consoleErrors` | `[]` | `[]` |

- `<Image>` 实际产出 `srcset`（640/960/1280/1600w + `sizes="(max-width: 44rem) 100vw, 704px"`），构建期转 WebP 五档：**34 / 67 / 113 / 167 / 455 kB**（原图 783 kB）。
- `data-hero` 属性已按计划挂在 Hero 根节点上，供 **U7** 判断"顶栏是否压在 Hero 上"。

**带 cover 的卡片（用小号临时文章 `_cover-test.md` 实测，验完已删）**

- schema 改成 `({ image }) => z.object({ …, cover: image().optional(), coverAlt: z.string().optional() })` 后，frontmatter 里写 `cover: ../../assets/133284436_p0.jpg`（相对本篇 md 的路径）能正常构建——12 pages，无报错。
- 封面盒实测 **662×372（比例 1.778，即 16/9）**、`object-fit: cover`、带 `srcset`、`alt` 取自 `coverAlt`；`href` 指向 `/blog/posts/_cover-test/`，链接带 `tabindex="-1"` + `aria-hidden="true"`（标题本身也是链接，避免屏幕阅读器重复播报）。
- 卡片高度 **544**（封面 372 + 文字区 170）vs 无 cover 的 **172** —— 这正是 **B2** 的预期表现：同列卡片高低不齐，不占位。

**其余页面回归（`_audit/u5-verify.cjs`，5 个页面全绿，`HTTP>=400` 为空）**

| 页面 | 标题 | h1 | 有 Hero | 卡片数 |
| --- | --- | --- | --- | --- |
| `/blog/` | Emila 的博客 | Emila 的博客 | ✅ | 3 |
| `/blog/archive/` | 归档 · Emila 的博客 | 归档 | — | 0 |
| `/blog/about/` | 关于 · Emila 的博客 | 关于 | — | 0 |
| `/blog/tags/建站/` | 标签：建站 · Emila 的博客 | 标签：建站 | — | 0 |
| `/blog/posts/why-astro/` | 为什么最后选了 Astro · Emila 的博客 | 为什么最后选了 Astro | — | 0 |

深色模式（`Emulation.setEmulatedMedia` 强制 `prefers-color-scheme: dark`）：卡片底 `rgb(27, 32, 39)`、边框 `rgb(42, 49, 56)`、Hero 标题仍是纯白 `rgb(255, 255, 255)`，与浅色一致可读。

### ★ U6 实测结果（2026-10-02，同一套 CDP 环境）

临时造了一篇 `src/content/posts/_lightbox-test.md`（4 个 h2 + 1 个 h3 + 2 张图，验完已删，`git status --short` 确认无残留），跑 `_audit/u6-verify.cjs` → **24/24 通过**，`consoleErrors []`、无 4xx/5xx。

| # | 断言 | 结果 |
|---|---|---|
| 1 | TOC 存在且宽屏默认展开 | ✅ `open: true` |
| 2 | 五条（4 个 h2 + 1 个 h3），h3 带 `toc-depth-3` | ✅ |
| 3 | 每个 `href` 都有对应 `id` | ✅ |
| 4 | 点目录滚到锚点且**让开 sticky 顶栏** | ✅ 见下 |
| 5 | meta 行有阅读时长 | ✅ `约 1 分钟` |
| 6 | 灯箱初始未打开 | ✅ |
| 7 | 点图打开、计数 `1 / 2`、放的是同一张 | ✅ |
| 8 | `→` 切到 `2 / 2`、越界回 `1 / 2`、`←` 回 `2 / 2` | ✅ |
| 9 | 点背景关闭 / `Esc` 关闭 | ✅ |
| 10 | 点第二张直接定位到 `2 / 2` | ✅ |
| 11 | 正文图片 `cursor: zoom-in` | ✅ |
| 12 | 客户端导航绕一圈（文章 → 标签页 → 文章）后灯箱仍能打开 | ✅ |
| 13 | 窄屏（390px）TOC 默认收起、无横向溢出 | ✅ |
| 14 | 深色模式目录配色跟随主题 | ✅ TOC 底 `rgb(27, 32, 39)` |

**★ 锚点跳转撞上 sticky 顶栏（本轮唯一一处真问题）**

第一次跑验收时「点目录跳转」失败：`{"hash":"#第二节","scrollY":787,"top":621,"maxScroll":787}`。查下来是**测试文档太短**——文档总高 1687、视口 900，最大滚动量只有 787，最后一个小节滚不到顶部，属测试用例的问题。

但顺着查下去暴露了真问题：`.site-header` 是 `position: sticky; top: 0`、高 **61px**，锚点若被滚到 `top: 0` 就会**藏在顶栏底下**（首次的「成功」只是被最大滚动量凑巧掩盖了）。

修法：`src/styles/global.css` 里给正文标题加 `scroll-margin-top: 4.5rem`（72px）。把测试文档撑到 2179 高后复测：`#第一节` 绝对位置 916 → `scrollY = 916 - 72 = 844`，视口内 `top = 72`，顶栏底 61 → **留出 11px**，符合预期。**教训：给带 sticky 顶栏的页面做目录，`scroll-margin-top` 是必需项，而且必须用足够长的文档去验，否则会被「已经滚到底了」的假象骗过去。**

**★ 灯箱按钮一开始被挤出屏幕**

初版把 `‹` / `›` 相对 `<dialog>` 定位（`left: calc(-1 * (2.6rem + 0.75rem))`），落在图外。但图片宽度已经被 `max-width: 94vw` 顶住，图几乎占满视口，按钮就被推到视口之外——**截图里根本看不到**，24 条 DOM 断言却全绿。

修法：改成 `position: fixed`，直接以视口定位（左右各 `1rem`、关闭键 `top: 1rem; right: 1rem`），顺带删掉了原来那条窄屏媒体查询。**又一次印证 U3/U4 的教训：结构化断言代替不了看一眼真实渲染。**

**回看脚本（`_audit/`，已 gitignore）**：`u6-verify.cjs`（24 条验收 + 截图）、`u6-anchor.cjs`（打印文档高度、标题绝对位置、`scroll-margin-top`，用来定位锚点问题）。截图落在 `C:\Users\Emila_58035\AppData\Local\Temp\`：`u6-post-top.png`、`u6-lightbox.png`、`u6-post-mobile.png`。

---

## 9. 待你拍板的小项

以下是我已经定了默认做法、但你可能想改的地方，**不改就按这里写**：

1. **Hero 的文案**：**已按默认实施** —— 标题 `Emila 的博客`，副标题 `记录一些想法，以及折腾过的东西。`（取自首页原有文案）。要改写请直接给文字。
2. ~~**卡片列表每行几个**~~ **已定（m01675）：每行一列。**
3. **归档页/标签页是否也卡片化**：默认**不**改（保持现在的紧凑列表），只有首页卡片化。
4. **圆钮的动画强度**：**已按用户批注定为唱片纹理**。收起态是一张迷你唱片——同心细沟 + 偏心的斜向高光 + 中心标签面，图标落在标签上；播放时匀速旋（6s/圈），暂停时停在当前角度。详见上文 U5 阶段的「★ 唱片纹理」小节。
5. **阅读时长的显示位置**：**已按默认实施** —— 放在文章头部 meta 行（与日期、标签同一行），归档页不加。算法是中文 350 字/分 + 西文 200 词/分，代码块不计入（见 `src/utils/reading.ts`）。
6. ~~**是否要封面图的默认渐变样式**~~ **已定（m01710）：B2** —— 无 `cover` 的文章**不渲染封面区**，卡片更紧凑、文字密度更高；接受同一列里卡片高低不齐。第 5.2 节的 B1/B3 作废。

---

## 附：主文档与本方案的边界

- `PLAN.md` 是**建造记录**（M0–M6，已冻结，只在需要更正事实时改）；
- 本文是**优化阶段方案**（v10，U1–U8），实施过程中逐项勾掉；
- 实施完成后，把 U 里程碑的结论回填到本文第 8 节，而不是塞进主文档。
