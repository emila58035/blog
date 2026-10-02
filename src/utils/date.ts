/** 把日期格式化成 2026-09-28 这样的形式 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 按发布日期倒序排列 */
export function sortByDate<T extends { data: { pubDate: Date } }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}
