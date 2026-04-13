import { createClient } from 'npm:@supabase/supabase-js';
import { AccessToken } from 'npm:livekit-server-sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY') || '';
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET') || '';

    if (!supabaseUrl || !supabaseAnonKey || !livekitApiKey || !livekitApiSecret) {
      return new Response(JSON.stringify({ error: 'missing_env' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
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

    const rtcRoomId = `room-${String(roomId).replaceAll('-', '')}`;
    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: String(participantId),
      ttl: '10m',
      metadata: JSON.stringify({
        roomId,
        participantId,
        userId: userData.user.id,
      }),
    });

    token.addGrant({
      roomJoin: true,
      room: rtcRoomId,
      canPublish: true,
      canSubscribe: true,
    });

    return new Response(JSON.stringify({
      token: await token.toJwt(),
      rtcRoomId,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'unknown_error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
