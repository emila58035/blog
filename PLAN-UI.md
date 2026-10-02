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
- 正在播放时圆钮缓慢旋转（`@keyframes`），暂停时停住；
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
| U3 | 歌单面板 | 78 首可滚动；当前曲高亮且自动滚入视野；点击即切歌；面板打开时不被自动收纳 | ⬜ |
| U4 | 自动收纳成 3rem 圆钮 | 悬停展开/移开收起；进度环反映播放进度；切页后状态保持 | ⬜ |
| U5 | 首页 Hero + 卡片列表 | 无 cover 的文章走 B2（不占位）；40vh 与内容栏对齐；移动端不塌 | ⬜ |
| U6 | 文章页：TOC + 阅读时长 + 灯箱 | 锚点跳转正确；移动端 TOC 可折叠；灯箱键盘操作与多图切换可用 | ⬜ |
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

## 9. 待你拍板的小项

以下是我已经定了默认做法、但你可能想改的地方，**不改就按这里写**：

1. **Hero 的文案**：现在默认用 `Emila 的博客` + 副标题 `记录一些想法，以及折腾过的东西。`（取自首页现有文案）。要改写请直接给文字。
2. ~~**卡片列表每行几个**~~ **已定（m01675）：每行一列。**
3. **归档页/标签页是否也卡片化**：默认**不**改（保持现在的紧凑列表），只有首页卡片化。
4. **圆钮的动画强度**：默认"缓慢旋转 + 进度环"，如果嫌晃眼可以改成"静止 + 仅在悬停时轻微放大"。
5. **阅读时长的显示位置**：默认放在文章头部 meta 行（与日期、标签同一行），归档页不加。
6. ~~**是否要封面图的默认渐变样式**~~ **已定（m01710）：B2** —— 无 `cover` 的文章**不渲染封面区**，卡片更紧凑、文字密度更高；接受同一列里卡片高低不齐。第 5.2 节的 B1/B3 作废。

---

## 附：主文档与本方案的边界

- `PLAN.md` 是**建造记录**（M0–M6，已冻结，只在需要更正事实时改）；
- 本文是**优化阶段方案**（v10，U1–U8），实施过程中逐项勾掉；
- 实施完成后，把 U 里程碑的结论回填到本文第 8 节，而不是塞进主文档。
