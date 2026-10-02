// 从网易云歌单生成可播放歌单（过滤掉只能试听的付费曲目）
//
// 为什么需要这个脚本：
//   实测确认网易云的 `fee` 字段决定能否完整播放 ——
//     fee=1  → 只有 30 秒试听（481,115 字节 / 128kbps，与歌曲长度无关）
//     fee=8  → 完整音频（320 kbps）
//     fee=0  → 免费完整
//   Meting API 本身不返回 fee，所以不能只靠它过滤。
//
// ★ 为什么必须用 weapi 加密端点（别再退回轻量端点）：
//   轻量端点 `/api/v6/playlist/detail` 对**用户自建歌单会截断 `tracks` 数组**，
//   只返回前几首（实测 171 首的歌单只给 6 首，78 首的只给 10 首），
//   而 `trackIds` 里是全量 —— 之前正是只读了 tracks，静默丢掉 96% 的曲目。
//   该端点的 `n` / `limit` / `offset` / `s` 参数对用户歌单全部无效，调多大都没用。
//   官方前端用的 `/weapi/v6/playlist/detail`（AES-128-CBC 加密参数 + RSA 加密
//   密钥，POST）则完整返回，`limit` 也真实生效。
//   ⚠️ 加密参数不加 `Cookie: os=pc` 同样只回 6~10 首，这个 cookie 是必需的。
//
// 用法：
//   node tools/music/fetch-playlist.mjs                # 用脚本里的默认歌单
//   node tools/music/fetch-playlist.mjs 7572834094     # 指定歌单（推荐写全）
//   METING_API=https://你的地址/ node tools/music/fetch-playlist.mjs
//
// 必须在仓库根目录执行（输出路径基于 process.cwd()）。
//
// 输出：public/audio/playlist.json
//   { "source": "meting", "api": "...", "server": "netease", "playlistId": "...",
//     "tracks": [{ "id", "title", "artist", "src", "cover", "lrc" }] }
//   其中 src/cover/lrc 是 Meting API 地址，浏览器播放时由该 API 302 到真实音频。

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** 默认歌单：7572834094《常听》 */
const DEFAULT_PLAYLIST_ID = '7572834094';

const PLAYLIST_ID = process.argv[2] || process.env.PLAYLIST_ID || DEFAULT_PLAYLIST_ID;
const API = process.env.METING_API || 'https://api.injahow.cn/meting/';
const SERVER = process.env.METING_SERVER || 'netease';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  Referer: 'https://music.163.com/',
  'Content-Type': 'application/x-www-form-urlencoded',
  // ★ 没有这个 cookie，weapi 对用户歌单同样只返回前 6~10 首
  Cookie: 'os=pc',
};

/** fee=1 表示只能试听 30 秒；0 与 8 都能完整播放 */
const PLAYABLE_FEES = new Set([0, 8]);

const apiUrl = (type, id) => `${API}?server=${SERVER}&type=${type}&id=${id}`;

// ── weapi 加密（网易云前端自身的请求格式，固定密钥/模数，非本仓库的机密） ──
const NONCE = '0CoJUm6Qyw8W8jud';
const IV = '0102030405060708';
const PUBKEY = '010001';
const MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';

/** AES-128-CBC 加密后再 base64 */
function aesEncrypt(text, key) {
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(IV));
  return Buffer.concat([cipher.update(Buffer.from(text, 'utf8')), cipher.final()]).toString('base64');
}

/** 把随机密钥反转后做 RSA 加密（网易云要求的固定格式），输出 256 位十六进制 */
function rsaEncrypt(text) {
  const reversedHex = Buffer.from(text, 'utf8').reverse().toString('hex');
  const modulus = BigInt('0x' + MODULUS);
  let result = 1n;
  let base = BigInt('0x' + reversedHex) % modulus;
  let exponent = BigInt('0x' + PUBKEY);
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    base = (base * base) % modulus;
    exponent >>= 1n;
  }
  return result.toString(16).padStart(256, '0');
}

function weapiBody(payload) {
  const secret = crypto.randomBytes(8).toString('hex').slice(0, 16);
  const params = aesEncrypt(aesEncrypt(JSON.stringify(payload), NONCE), secret);
  return new URLSearchParams({ params, encSecKey: rsaEncrypt(secret) }).toString();
}

/** 用官方前端的加密端点拉歌单，返回 playlist 对象 */
async function fetchPlaylist(id) {
  const body = weapiBody({ id: Number(id), offset: 0, total: true, limit: 1000, n: 1000, csrf_token: '' });
  const res = await fetch('https://music.163.com/weapi/v6/playlist/detail?csrf_token=', {
    method: 'POST',
    headers: HEADERS,
    body,
  });
  if (!res.ok) {
    throw new Error(`拉取歌单失败：HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.code !== 200 || !data.playlist) {
    throw new Error(`拉取歌单失败：code=${data.code} ${data.message ?? ''}`);
  }
  return data.playlist;
}

async function main() {
  console.log(`歌单 ${PLAYLIST_ID} · API ${API}`);

  const playlist = await fetchPlaylist(PLAYLIST_ID);
  const all = playlist.tracks ?? [];
  const expected = playlist.trackCount ?? 0;

  if (all.length === 0) {
    throw new Error('歌单里没有曲目（id 是否正确？歌单是否公开？）');
  }

  // ★ 完整性自检：这次静默丢歌就是因为没有任何校验，出问题要立刻报出来
  if (all.length !== expected) {
    console.warn(
      `⚠️  完整性异常：trackCount=${expected} 但只拿到 ${all.length} 首。` +
        `若差距很大，多半是网易云又改了返回结构，请检查是否仍带有 os=pc cookie。`
    );
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

  console.log(`《${playlist.name}》共 ${all.length} 首，保留 ${tracks.length} 首，跳过 ${skipped.length} 首（仅试听）`);
  if (skipped.length > 0) {
    console.log('跳过：' + skipped.slice(0, 10).join('、') + (skipped.length > 10 ? ' …' : ''));
    const ratio = skipped.length / all.length;
    if (ratio > 0.5) {
      console.warn(
        `⚠️  超过一半的曲目被过滤掉了（${Math.round(ratio * 100)}%）。` +
          `这是网易云的版权限制（fee=1 只给 30 秒），不是脚本出错 —— ` +
          `如果这个比例难以接受，考虑换歌单或改用自托管音频。`
      );
    }
  }
  console.log(`已写入 ${target}`);
}

await main();
