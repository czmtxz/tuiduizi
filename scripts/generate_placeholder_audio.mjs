import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const dir = path.join(process.cwd(), 'public', 'audio');
fs.mkdirSync(dir, { recursive: true });

const sampleRate = 22050;

const writeWav = (name, durationSec, sampleFn) => {
  const samples = Math.floor(sampleRate * durationSec);
  const channels = 1;
  const bits = 16;
  const blockAlign = channels * bits / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);

  let offset = 0;
  const ws = (s) => { buf.write(s, offset); offset += s.length; };
  const u32 = (v) => { buf.writeUInt32LE(v, offset); offset += 4; };
  const u16 = (v) => { buf.writeUInt16LE(v, offset); offset += 2; };

  ws('RIFF');
  u32(36 + dataSize);
  ws('WAVE');
  ws('fmt ');
  u32(16);
  u16(1);
  u16(channels);
  u32(sampleRate);
  u32(byteRate);
  u16(blockAlign);
  u16(bits);
  ws('data');
  u32(dataSize);

  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const value = Math.max(-1, Math.min(1, sampleFn(t, i, samples)));
    buf.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }

  fs.writeFileSync(path.join(dir, name), buf);
};

const env = (t, amplitude = 0.9, decay = 0.2) =>
  Math.exp(-t / Math.max(0.001, decay)) * amplitude;

writeWav('sfx_click.wav', 0.09, (t) => Math.sin(2 * Math.PI * 1400 * t) * env(t, 0.5, 0.03));
writeWav('sfx_ding.wav', 0.22, (t) =>
  0.5 * Math.sin(2 * Math.PI * 980 * t) * env(t, 0.8, 0.15) +
  0.25 * Math.sin(2 * Math.PI * 1480 * t) * env(t, 0.6, 0.18)
);
writeWav('sfx_chip.wav', 0.18, (t) =>
  0.35 * Math.sin(2 * Math.PI * 300 * t) * env(t, 0.9, 0.08) +
  0.18 * (Math.random() * 2 - 1) * env(t, 0.5, 0.04)
);
writeWav('sfx_dice.wav', 0.42, (t) =>
  0.24 * (Math.random() * 2 - 1) * env(t, 1, 0.18) +
  0.12 * Math.sin(2 * Math.PI * (120 + 80 * Math.sin(t * 40)) * t)
);
writeWav('sfx_whoosh.wav', 0.35, (t) =>
  0.22 * (Math.random() * 2 - 1) * env(Math.max(0, 0.35 - t), 1, 0.25)
);
writeWav('sfx_flip.wav', 0.16, (t) => 0.4 * Math.sin(2 * Math.PI * 520 * t) * env(t, 0.9, 0.09));

const bet = (name, f1, f2) =>
  writeWav(name, 0.28, (t) =>
    0.35 * Math.sin(2 * Math.PI * f1 * t) * env(t, 0.9, 0.12) +
    0.25 * Math.sin(2 * Math.PI * f2 * t) * env(Math.max(0, t - 0.05), 0.7, 0.16)
  );

bet('sfx_bet_touzi.wav', 240, 420);
bet('sfx_bet_cha.wav', 180, 320);
bet('sfx_bet_liangdao.wav', 320, 520);
bet('sfx_bet_sandao.wav', 380, 620);
bet('sfx_bet_duizi.wav', 460, 700);
bet('sfx_bet_hong.wav', 540, 820);

writeWav('bgm_lobby.wav', 3.2, (t) =>
  0.08 * Math.sin(2 * Math.PI * 220 * t) +
  0.05 * Math.sin(2 * Math.PI * 330 * t) +
  0.03 * Math.sin(2 * Math.PI * 440 * t)
);

writeWav('bgm_room.wav', 3.2, (t) =>
  0.07 * Math.sin(2 * Math.PI * 196 * t) +
  0.05 * Math.sin(2 * Math.PI * 294 * t) +
  0.025 * Math.sin(2 * Math.PI * 392 * t)
);

console.log(`generated placeholder audio in ${dir}`);
