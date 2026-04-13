import type { AudioPrefs } from './types';

const KEY = 'tuiduizi.audio.prefs.v1';

export const defaultAudioPrefs: AudioPrefs = {
  masterVolume: 0.9,
  sfxVolume: 0.8,
  voiceVolume: 0.9,
  muted: false,
  bgmEnabled: false,
  sfxEnabled: true,
  voiceEnabled: true,
  spatialEnabled: true,
  voiceFxEnabled: true,
  easterEggEnabled: true,
  betSyncSfxEnabled: true,
  bgmId: 'lobby',
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const loadAudioPrefs = (): AudioPrefs => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultAudioPrefs;
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    return {
      ...defaultAudioPrefs,
      ...parsed,
      masterVolume: clamp01(Number(parsed.masterVolume ?? defaultAudioPrefs.masterVolume)),
      sfxVolume: clamp01(Number(parsed.sfxVolume ?? defaultAudioPrefs.sfxVolume)),
      voiceVolume: clamp01(Number(parsed.voiceVolume ?? defaultAudioPrefs.voiceVolume)),
      muted: Boolean(parsed.muted ?? defaultAudioPrefs.muted),
      bgmEnabled: Boolean(parsed.bgmEnabled ?? defaultAudioPrefs.bgmEnabled),
      sfxEnabled: Boolean(parsed.sfxEnabled ?? defaultAudioPrefs.sfxEnabled),
      voiceEnabled: Boolean(parsed.voiceEnabled ?? defaultAudioPrefs.voiceEnabled),
      spatialEnabled: Boolean(parsed.spatialEnabled ?? defaultAudioPrefs.spatialEnabled),
      voiceFxEnabled: Boolean(parsed.voiceFxEnabled ?? defaultAudioPrefs.voiceFxEnabled),
      easterEggEnabled: Boolean(parsed.easterEggEnabled ?? defaultAudioPrefs.easterEggEnabled),
      betSyncSfxEnabled: Boolean(parsed.betSyncSfxEnabled ?? defaultAudioPrefs.betSyncSfxEnabled),
      bgmId: String(parsed.bgmId ?? defaultAudioPrefs.bgmId),
    };
  } catch {
    return defaultAudioPrefs;
  }
};

export const saveAudioPrefs = (prefs: AudioPrefs) => {
  localStorage.setItem(KEY, JSON.stringify(prefs));
};
