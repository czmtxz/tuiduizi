import { supabase } from '../lib/supabase';

export type AgoraConfig = {
  appId: string;
  tokenEndpoint: string;
};

const env = import.meta.env as Record<string, string | undefined>;

export const resolveAgoraConfig = (
  envSource: Record<string, string | undefined> = env
): AgoraConfig | null => {
  const appId = String(envSource.VITE_AGORA_APP_ID || '').trim();
  if (!appId) return null;

  const supabaseUrl = String(envSource.VITE_SUPABASE_URL || '').trim();
  const tokenEndpoint =
    String(envSource.VITE_AGORA_TOKEN_ENDPOINT || '').trim() ||
    (supabaseUrl ? `${supabaseUrl}/functions/v1/agora-token` : '');
  if (!tokenEndpoint) return null;

  return { appId, tokenEndpoint };
};

export const fetchAgoraRtcToken = async (
  config: AgoraConfig,
  roomId: string,
  participantId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ appId: string; channel: string; uid: number; token: string }> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetchFn(config.tokenEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ roomId, participantId }),
  });
  const body = (await res.json().catch(() => null)) as null | Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof body?.error === 'string' ? body.error : `agora-token-${res.status}`;
    throw new Error(msg);
  }

  const appId = String(body?.appId || config.appId).trim();
  const channel = String(body?.channel || '').trim();
  const token = String(body?.token || '').trim();
  const uid = typeof body?.uid === 'number' ? body.uid : Number(body?.uid || 0);
  if (!appId || !channel || !token || !Number.isFinite(uid) || uid <= 0) {
    throw new Error('invalid_agora_token');
  }
  return { appId, channel, uid, token };
};

