import { createClient } from 'npm:@supabase/supabase-js';
import agoraAccessToken from 'npm:agora-access-token';

const { RtcTokenBuilder, RtcRole } = agoraAccessToken as unknown as {
  RtcTokenBuilder: typeof agoraAccessToken['RtcTokenBuilder'];
  RtcRole: typeof agoraAccessToken['RtcRole'];
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const toUid = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let hash = 2166136261;
  for (const b of bytes) {
    hash ^= b;
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) % 2147483646;
  return normalized + 1;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const appId = Deno.env.get('AGORA_APP_ID') || '';
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE') || '';
    const expireRaw = Deno.env.get('AGORA_TOKEN_EXPIRE_SECONDS') || '';
    if (!supabaseUrl || !supabaseAnonKey || !appId || !appCertificate) {
      return new Response(JSON.stringify({ error: 'missing_env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { roomId, participantId } = await req.json();
    if (!roomId || !participantId) {
      return new Response(JSON.stringify({ error: 'invalid_payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'player_not_found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'voice_muted_by_admin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ttl = expireRaw ? Number(expireRaw) : 3600;
    const privilegeExpiredTs = Math.floor(Date.now() / 1000) + (Number.isFinite(ttl) && ttl > 60 ? ttl : 3600);
    const channel = `room-${String(roomId).replaceAll('-', '')}`;
    const uid = toUid(`${roomId}:${participantId}`);
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs
    );

    return new Response(JSON.stringify({ appId, channel, uid, token }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'unknown_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

