export type LiveKitConfig = {
  url: string;
  tokenEndpoint: string;
};

export const resolveLiveKitConfig = (
  env: Record<string, string | undefined>
): LiveKitConfig | null => {
  const url = env.VITE_LIVEKIT_URL?.trim();
  const tokenEndpoint =
    env.VITE_LIVEKIT_TOKEN_ENDPOINT?.trim() ||
    (env.VITE_SUPABASE_URL?.trim() ? `${env.VITE_SUPABASE_URL!.trim()}/functions/v1/livekit-token` : '');
  if (!url || !tokenEndpoint) return null;
  return { url, tokenEndpoint };
};

export const fetchLiveKitToken = async (
  config: LiveKitConfig,
  roomId: string,
  participantId: string,
  fetchImpl: typeof fetch = fetch,
  extraHeaders?: Record<string, string>
) => {
  let res: Response;
  try {
    res = await fetchImpl(config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(extraHeaders || {}),
      },
      body: JSON.stringify({
        roomId,
        participantId,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'network_error';
    throw new Error(`获取 LiveKit token 失败: ${message}`);
  }

  if (!res.ok) {
    throw new Error(`获取 LiveKit token 失败: http_${res.status}`);
  }

  const payload = (await res.json()) as { token?: string };
  if (!payload.token) {
    throw new Error('LiveKit token 缺失');
  }
  return payload.token;
};
