// 从网易云歌单生成可播放歌单（过滤掉只能试听的付费曲目）
//
// 为什么需要这个脚本：
//   实测确认网易云的 `fee` 字段决定能否完整播放 ——
//     fee=1  → 只有 30 秒试听（481,115 字节 / 128kbps，与歌曲长度无关）
//     fee=8  → 完整音频（320 kbps）
//   Meting API 本身不返回 fee，所以不能只靠它过滤；用网易云公开的
//   播放列表接口（免费歌无需 cookie）一次性拿到整张歌单的 fee 标记。
//
// 用法：
//   node tools/music/fetch-playlist.mjs [歌单ID]     # 省略则用默认 60198
//   node tools/music/fetch-playlist.mjs 60198
//
// 必须在仓库根目录执行（输出路径基于 process.cwd()）。
//
// 输出：public/audio/playlist.json
//   { "source": "meting", "api": "...", "server": "netease",
//     "tracks": [{ "id", "title", "artist", "src", "cover", "lrc" }] }
//   其中 src/cover/lrc 是 Meting API 地址，浏览器播放时由该 API 302 到真实音频。

import fs from 'node:fs';
import path from 'node:path';

const PLAYLIST_ID = process.argv[2] || '60198';
const API = process.env.METING_API || 'https://api.injahow.cn/meting/';
const SERVER = process.env.METING_SERVER || 'netease';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  Referer: 'https://music.163.com/',
};

/** fee=1 表示只能试听 30 秒；0 与 8 都能完整播放 */
const PLAYABLE_FEES = new Set([0, 8]);

const apiUrl = (type, id) => `${API}?server=${SERVER}&type=${type}&id=${id}`;

async function main() {
  console.log(`歌单 ${PLAYLIST_ID} · API ${API}`);

  const res = await fetch(
    `https://music.163.com/api/v6/playlist/detail?id=${PLAYLIST_ID}&n=1000`,
    { headers: HEADERS }
  );
  if (!res.ok) {
    throw new Error(`拉取歌单失败：HTTP ${res.status}`);
  }
  const data = await res.json();
  const all = data?.playlist?.tracks ?? [];
  if (all.length === 0) {
    throw new Error('歌单里没有曲目（id 是否正确？歌单是否公开？）');
  }

  const skipped = [];
  const tracks = [];
  for (const t of all) {
    if (!PLAYABLE_FEES.has(t.fee)) {
      skipped.push(`${t.name}（fee=${t.fee}）`);
      continue;
    }
    tracks.push({
      id: t.id,
      title: t.name,
      artist: (t.ar ?? []).map((a) => a.name).join(' / ') || '未知歌手',
      src: apiUrl('url', t.id),
      cover: apiUrl('pic', t.id),
      lrc: apiUrl('lrc', t.id),
    });
  }

  const out = {
    source: 'meting',
    api: API,
    server: SERVER,
    playlistId: PLAYLIST_ID,
    tracks,
  };

  const target = path.join(process.cwd(), 'public', 'audio', 'playlist.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');

  console.log(`歌单共 ${all.length} 首，保留 ${tracks.length} 首，跳过 ${skipped.length} 首（仅试听）`);
  if (skipped.length > 0) {
    console.log('跳过：' + skipped.slice(0, 10).join('、') + (skipped.length > 10 ? ' …' : ''));
  }
  console.log(`已写入 ${target}`);
}

await main();
