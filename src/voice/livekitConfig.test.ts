import { describe, expect, it, vi } from 'vitest';
import { fetchLiveKitToken, resolveLiveKitConfig } from './livekitConfig';

describe('livekitConfig', () => {
  it('returns null when env is incomplete', () => {
    expect(resolveLiveKitConfig({ VITE_LIVEKIT_URL: 'wss://x' })).toBeNull();
    expect(resolveLiveKitConfig({ VITE_LIVEKIT_TOKEN_ENDPOINT: 'https://x/token' })).toBeNull();
  });

  it('falls back to supabase edge function endpoint', () => {
    expect(resolveLiveKitConfig({
      VITE_LIVEKIT_URL: 'wss://voice.example.com',
      VITE_SUPABASE_URL: 'https://demo.supabase.co',
    })).toEqual({
      url: 'wss://voice.example.com',
      tokenEndpoint: 'https://demo.supabase.co/functions/v1/livekit-token',
    });
  });

  it('returns config when env is complete', () => {
    expect(resolveLiveKitConfig({
      VITE_LIVEKIT_URL: 'wss://voice.example.com',
      VITE_LIVEKIT_TOKEN_ENDPOINT: 'https://api.example.com/token',
    })).toEqual({
      url: 'wss://voice.example.com',
      tokenEndpoint: 'https://api.example.com/token',
    });
  });

  it('fetches token from endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'abc123' }),
    });

    const token = await fetchLiveKitToken(
      { url: 'wss://voice.example.com', tokenEndpoint: 'https://api.example.com/token' },
      'room-1',
      'player-1',
      fetchMock as unknown as typeof fetch
    );

    expect(token).toBe('abc123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes extra headers to endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'abc123' }),
    });

    await fetchLiveKitToken(
      { url: 'wss://voice.example.com', tokenEndpoint: 'https://api.example.com/token' },
      'room-1',
      'player-1',
      fetchMock as unknown as typeof fetch,
      { Authorization: 'Bearer token' }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/token',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      })
    );
  });

  it('throws when token endpoint responds without token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(
      fetchLiveKitToken(
        { url: 'wss://voice.example.com', tokenEndpoint: 'https://api.example.com/token' },
        'room-1',
        'player-1',
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow('LiveKit token 缺失');
  });
});
