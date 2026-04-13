import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import agoraAccessToken from 'agora-access-token';

const { RtcTokenBuilder, RtcRole } = agoraAccessToken;

const PORT = Number(process.env.PORT || 8789);
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '').trim();
const AGORA_APP_ID = String(process.env.AGORA_APP_ID || '').trim();
const AGORA_APP_CERTIFICATE = String(process.env.AGORA_APP_CERTIFICATE || '').trim();
const EXPIRE_SECONDS_RAW = String(process.env.AGORA_TOKEN_EXPIRE_SECONDS || '').trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
  throw new Error('missing_env');
}

const expireSeconds = EXPIRE_SECONDS_RAW ? Number(EXPIRE_SECONDS_RAW) : 3600;
const ttl = Number.isFinite(expireSeconds) && expireSeconds > 60 ? expireSeconds : 3600;

const toUid = (value) => {
  const bytes = new TextEncoder().encode(value);
  let hash = 2166136261;
  for (const b of bytes) {
    hash ^= b;
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) % 2147483646;
  return normalized + 1;
};

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
};

const readJson = async (req) => {
  let raw = '';
  for await (const chunk of req) {
    raw += String(chunk);
    if (raw.length > 128 * 1024) throw new Error('payload_too_large');
  }
  return raw ? JSON.parse(raw) : {};
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

  if (req.method !== 'POST' || req.url?.split('?')[0] !== '/agora/token') {
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
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
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

    const channel = `room-${roomId.replace(/-/g, '')}`;
    const uid = toUid(`${roomId}:${participantId}`);
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + ttl;
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channel,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs
    );

    json(res, 200, {
      appId: AGORA_APP_ID,
      channel,
      uid,
      token,
    });
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : 'unknown_error' });
  }
});

server.listen(PORT, () => {
  console.log(`[agora-token] http://0.0.0.0:${PORT}/agora/token`);
});

