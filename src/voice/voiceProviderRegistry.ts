import { BrowserVoiceProvider } from './browserVoiceProvider';
import { resolveAgoraConfig } from './agoraConfig';
import { AgoraVoiceProvider } from './agoraVoiceProvider';
import type { VoiceProvider } from './provider';
import { LiveKitVoiceProvider } from './livekitVoiceProvider';
import { resolveLiveKitConfig } from './livekitConfig';

const env = import.meta.env as Record<string, string | undefined>;

let singleton: VoiceProvider | null = null;
export type VoiceProviderPreference = 'auto' | 'agora' | 'livekit' | 'browser';

const warnWhenMultipleProvidersEnabled = (
  preferred: VoiceProviderPreference,
  enabledProviders: Array<'agora' | 'livekit'>
) => {
  if (!import.meta.env.DEV || preferred !== 'auto' || enabledProviders.length <= 1) return;
  console.warn(
    `[voice] multiple providers configured (${enabledProviders.join(', ')}); auto now prefers livekit to avoid mixed-room audio`
  );
};

export const createVoiceProvider = (
  envSource: Record<string, string | undefined> = env,
  preferred: VoiceProviderPreference = 'auto'
): VoiceProvider => {
  const canAgora = Boolean(resolveAgoraConfig(envSource));
  const canLiveKit = Boolean(resolveLiveKitConfig(envSource));
  const enabledProviders = [
    canAgora ? 'agora' : null,
    canLiveKit ? 'livekit' : null,
  ].filter(Boolean) as Array<'agora' | 'livekit'>;

  if (preferred === 'agora' && canAgora) return new AgoraVoiceProvider();
  if (preferred === 'livekit' && canLiveKit) return new LiveKitVoiceProvider();
  if (preferred === 'browser') return new BrowserVoiceProvider();

  // In local/dev environments multiple providers can be configured at once.
  // Prefer LiveKit first so different tabs do not auto-select different backends.
  warnWhenMultipleProvidersEnabled(preferred, enabledProviders);
  if (canLiveKit) return new LiveKitVoiceProvider();
  if (canAgora) return new AgoraVoiceProvider();
  return new BrowserVoiceProvider();
};

export const getVoiceProvider = (preferred: VoiceProviderPreference = 'auto'): VoiceProvider => {
  if (!singleton) {
    singleton = createVoiceProvider(env, preferred);
  }
  return singleton;
};

export const resetVoiceProviderForTest = () => {
  singleton = null;
};
