import { describe, expect, it } from 'vitest';
import { createVoiceProvider } from './voiceProviderRegistry';

describe('voiceProviderRegistry', () => {
  it('creates browser provider when livekit config is missing', () => {
    const provider = createVoiceProvider({});
    expect(provider.kind).toBe('browser');
  });

  it('creates browser provider when admin preference forces browser', () => {
    const provider = createVoiceProvider({
      VITE_AGORA_APP_ID: 'demo',
      VITE_AGORA_TOKEN_ENDPOINT: 'https://api.example.com/agora-token',
    }, 'browser');
    expect(provider.kind).toBe('browser');
  });

  it('creates agora provider when agora config is present', () => {
    const provider = createVoiceProvider({
      VITE_AGORA_APP_ID: 'demo',
      VITE_AGORA_TOKEN_ENDPOINT: 'https://api.example.com/agora-token',
    });
    expect(provider.kind).toBe('agora');
  });

  it('prefers livekit in auto mode when multiple providers are configured', () => {
    const provider = createVoiceProvider({
      VITE_AGORA_APP_ID: 'demo',
      VITE_AGORA_TOKEN_ENDPOINT: 'https://api.example.com/agora-token',
      VITE_LIVEKIT_URL: 'wss://voice.example.com',
      VITE_LIVEKIT_TOKEN_ENDPOINT: 'https://api.example.com/livekit-token',
    });
    expect(provider.kind).toBe('livekit');
  });

  it('creates livekit provider when livekit config is present', () => {
    const provider = createVoiceProvider({
      VITE_LIVEKIT_URL: 'wss://voice.example.com',
      VITE_LIVEKIT_TOKEN_ENDPOINT: 'https://api.example.com/token',
    });
    expect(provider.kind).toBe('livekit');
  });

  it('creates livekit provider when supabase fallback endpoint is available', () => {
    const provider = createVoiceProvider({
      VITE_LIVEKIT_URL: 'wss://voice.example.com',
      VITE_SUPABASE_URL: 'https://demo.supabase.co',
    });
    expect(provider.kind).toBe('livekit');
  });

});
