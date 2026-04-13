export type AudioChannel = 'bgm' | 'sfx' | 'voice';

export type AudioPrefs = {
  masterVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  muted: boolean;
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  voiceEnabled: boolean;
  spatialEnabled: boolean;
  voiceFxEnabled: boolean;
  easterEggEnabled: boolean;
  betSyncSfxEnabled: boolean;
  bgmId: string;
};

export type Spatial = {
  x: number;
  y: number;
  z: number;
};

export type PlaySfxOptions = {
  volume?: number;
  playbackRate?: number;
  detune?: number;
  spatial?: Spatial;
  pan?: number;
};

export type VoiceTask = {
  id: string;
  priority: number;
  interrupt: boolean;
  dedupeKey?: string;
  cooldownMs?: number;
} & (
  | {
      kind: 'url';
      url: string;
    }
  | {
      kind: 'tts';
      text: string;
      lang?: string;
      rate?: number;
      pitch?: number;
    }
);
