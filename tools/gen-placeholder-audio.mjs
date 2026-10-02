// 生成占位曲目（自托管 mp3 的替代品，等用户放入真实音乐后可删）
// 用法：node tools/gen-placeholder-audio.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'audio');
const SR = 16000;

/** 极简和弦垫音：叠加正弦 + 指数衰减包络 + tanh 软限幅，输出 16-bit PCM WAV */
function synth(notes, seconds, decay = 1.1, gain = 0.42) {
  const n = Math.floor(SR * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  const dataLen = n * 2;

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataLen, 40);

  const noteDur = seconds / notes.length;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const idx = Math.min(Math.floor(t / noteDur), notes.length - 1);
    const local = t - idx * noteDur;
    const env = Math.exp(-decay * local);
    const f = notes[idx];
    const raw =
      Math.sin(2 * Math.PI * f * t) +
      0.3 * Math.sin(2 * Math.PI * f * 2 * t) +
      0.12 * Math.sin(2 * Math.PI * f * 3 * t);
    // tanh 软限幅，保证不越界且无硬削波失真
    const s = Math.tanh(gain * env * raw);
    const v = Math.max(-32768, Math.min(32767, Math.round(s * 32000)));
    buf.writeInt16LE(v, 44 + i * 2);
  }
  return buf;
}

const C = 261.63,
  D = 293.66,
  E = 329.63,
  F = 349.23,
  G = 392.0,
  A = 440.0,
  B = 493.88,
  C5 = 523.25;

const tracks = [
  { file: 'placeholder-1.wav', notes: [C, E, G, C5, G, E, C, G], seconds: 40, decay: 1.0 },
  { file: 'placeholder-2.wav', notes: [A, C, E, A, E, C, A, E], seconds: 40, decay: 1.3 },
  { file: 'placeholder-3.wav', notes: [D, F, A, D * 2, A, F, D, A], seconds: 40, decay: 0.85 },
];

fs.mkdirSync(OUT, { recursive: true });
for (const t of tracks) {
  const buf = synth(t.notes, t.seconds, t.decay);
  fs.writeFileSync(path.join(OUT, t.file), buf);
  console.log(`${t.file}  ${(buf.length / 1024).toFixed(1)} KB  ${t.seconds}s`);
}
console.log('done');
