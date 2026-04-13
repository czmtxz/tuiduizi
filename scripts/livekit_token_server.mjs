import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    out[k] = v;
  }
  return out;
};

const env = {
  ...readEnvFile(path.join(root, '.env')),
  ...readEnvFile(path.join(root, '.env.local')),
  ...process.env,
};

const LIVEKIT_API_KEY = String(env.LIVEKIT_API_KEY || '').trim();
const LIVEKIT_API_SECRET = String(env.LIVEKIT_API_SECRET || '').trim();
const PORT = Number(env.LIVEKIT_TOKEN_PORT || 8787);

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('Missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET in .env.local (recommended)');
  process.exit(1);
}

const base64url = (input) => {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const signJwt = (header, payload, secret) => {
  const h = base64url(JSON.stringify(header));
  const p = base64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${base64url(sig)}`;
};

const json = (res, status, body) => {
  const content = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(content);
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url?.split('?')[0] !== '/rtc/token') {
    json(res, 404, { error: 'not_found' });
    return;
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += String(chunk);
    if (raw.length > 64 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      const payload = raw ? JSON.parse(raw) : {};
      const roomId = String(payload.roomId || '').trim();
      const participantId = String(payload.participantId || '').trim();
      if (!roomId || !participantId) {
        json(res, 400, { error: 'invalid_payload' });
        return;
      }

      const rtcRoomId = `room-${roomId.replace(/-/g, '')}`;
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 10 * 60;
      const jwt = signJwt(
        { alg: 'HS256', typ: 'JWT' },
        {
          iss: LIVEKIT_API_KEY,
          sub: participantId,
          nbf: now - 5,
          iat: now,
          exp,
          video: {
            roomJoin: true,
            room: rtcRoomId,
            canPublish: true,
            canSubscribe: true,
          },
          metadata: JSON.stringify({ roomId, participantId }),
        },
        LIVEKIT_API_SECRET
      );

      json(res, 200, { token: jwt, rtcRoomId });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : 'unknown_error' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[livekit-token-server] http://localhost:${PORT}/rtc/token`);
});

