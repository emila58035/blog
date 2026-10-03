const CJK = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;
const WORD = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;

/**
 * 估算阅读时长（分钟）。
 * 中文按 350 字/分、西文按 200 词/分，两者相加后向上取整，最少 1 分钟。
 *
 * 代码块必须扣掉：正文里贴一段长代码会让字数虚高好几倍，而读代码和读散文
 * 的速度完全不是一回事。图片、链接的地址部分也一并去掉。
 */
export function readingMinutes(markdown: string): number {
  const text = markdown
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^\s{0,3}[#>|-]+/gm, '');

  const cjk = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, ' ').match(WORD)?.length ?? 0;

  return Math.max(1, Math.ceil(cjk / 350 + words / 200));
}
