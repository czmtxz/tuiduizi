import http from 'node:http';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '').trim();
const LIVEKIT_API_KEY = String(process.env.LIVEKIT_API_KEY || '').trim();
const LIVEKIT_API_SECRET = String(process.env.LIVEKIT_API_SECRET || '').trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  throw new Error('missing_env');
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

const readJson = async (req) => {
  let raw = '';
  for await (const chunk of req) {
    raw += String(chunk);
    if (raw.length > 128 * 1024) throw new Error('payload_too_large');
  }
  return raw ? JSON.parse(raw) : {};
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

const server = http.createServer(async (req, res) => {
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

  try {
    const authHeader = String(req.headers.authorization || '').trim();
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }

    const payload = await readJson(req);
    const roomId = String(payload.roomId || '').trim();
    const participantId = String(payload.participantId || '').trim();
    if (!roomId || !participantId) {
      json(res, 400, { error: 'invalid_payload' });
      return;
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, room_id, user_id, is_active')
      .eq('id', participantId)
      .eq('room_id', roomId)
      .eq('user_id', userData.user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (playerError || !player) {
      json(res, 403, { error: 'player_not_found' });
      return;
    }

    const { data: penalties } = await supabase
      .from('voice_penalties')
      .select('id, expires_at, revoked_at')
      .eq('room_id', roomId)
      .eq('target_player_id', participantId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    const activePenalty = (penalties || []).find((item) => !item.expires_at || new Date(item.expires_at).getTime() > Date.now());
    if (activePenalty) {
      json(res, 403, { error: 'voice_muted_by_admin' });
      return;
    }

    const rtcRoomId = `room-${String(roomId).replaceAll('-', '')}`;
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 10 * 60;
    const token = signJwt(
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
        metadata: JSON.stringify({
          roomId,
          participantId,
          userId: userData.user.id,
        }),
      },
      LIVEKIT_API_SECRET
    );

    json(res, 200, { token, rtcRoomId });
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : 'unknown_error' });
  }
});

server.listen(PORT, () => {
  console.log(`[voice-token] http://0.0.0.0:${PORT}/rtc/token`);
});

