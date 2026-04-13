import { create } from 'zustand';
import { AudioManager } from './AudioManager';
import { bgmAssets, sfxAssets, type BgmId, type SfxId } from './assets';
import { defaultAudioPrefs, loadAudioPrefs, saveAudioPrefs } from './prefs';
import type { AudioPrefs, PlaySfxOptions } from './types';

const manager = new AudioManager();

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export type AudioState = {
  prefs: AudioPrefs;
  settingsOpen: boolean;
  unlockPrompt: boolean;
  setSettingsOpen: (open: boolean) => void;
  unlockAudio: () => Promise<void>;
  setPrefs: (patch: Partial<AudioPrefs>) => void;
  restoreDefaults: () => void;
  playBgm: (id?: BgmId) => void;
  stopBgm: () => void;
  playSfx: (id: SfxId, opts?: PlaySfxOptions) => void;
  enqueueVoiceText: (text: string, opts?: { priority?: number; interrupt?: boolean; dedupeKey?: string; cooldownMs?: number; rate?: number; pitch?: number }) => void;
  clearVoiceQueue: () => void;
  preloadCommon: () => void;
  onVisibility: (hidden: boolean) => void;
};

export const useAudio = create<AudioState>((set, get) => {
  const prefs = loadAudioPrefs();
  manager.setPrefs(prefs);

  const setPrefs = (patch: Partial<AudioPrefs>) => {
    const next: AudioPrefs = {
      ...get().prefs,
      ...patch,
      masterVolume: clamp01(Number(patch.masterVolume ?? get().prefs.masterVolume)),
      sfxVolume: clamp01(Number(patch.sfxVolume ?? get().prefs.sfxVolume)),
      voiceVolume: clamp01(Number(patch.voiceVolume ?? get().prefs.voiceVolume)),
      bgmId: String(patch.bgmId ?? get().prefs.bgmId),
      muted: Boolean(patch.muted ?? get().prefs.muted),
      bgmEnabled: Boolean(patch.bgmEnabled ?? get().prefs.bgmEnabled),
      sfxEnabled: Boolean(patch.sfxEnabled ?? get().prefs.sfxEnabled),
      voiceEnabled: Boolean(patch.voiceEnabled ?? get().prefs.voiceEnabled),
      spatialEnabled: Boolean(patch.spatialEnabled ?? get().prefs.spatialEnabled),
      voiceFxEnabled: Boolean(patch.voiceFxEnabled ?? get().prefs.voiceFxEnabled),
      easterEggEnabled: Boolean(patch.easterEggEnabled ?? get().prefs.easterEggEnabled),
      betSyncSfxEnabled: Boolean(patch.betSyncSfxEnabled ?? get().prefs.betSyncSfxEnabled),
    };
    saveAudioPrefs(next);
    manager.setPrefs(next);
    set({ prefs: next });
  };

  return {
    prefs,
    settingsOpen: false,
    unlockPrompt: false,
    setSettingsOpen: open => set({ settingsOpen: open }),
    unlockAudio: async () => {
      const ok = await manager.unlock();
      set({ unlockPrompt: !ok && manager.getNeedsUnlock() });
    },
    setPrefs,
    restoreDefaults: () => {
      saveAudioPrefs(defaultAudioPrefs);
      manager.setPrefs(defaultAudioPrefs);
      set({ prefs: defaultAudioPrefs });
    },
    playBgm: (id?: BgmId) => {
      const prefId = (id || (get().prefs.bgmId as BgmId)) as BgmId;
      const asset = bgmAssets[prefId] || bgmAssets.lobby;
      setPrefs({ bgmId: prefId });
      manager.startBgm(asset.url, true).then(
        () => void 0,
        () => void 0
      );
      set({ unlockPrompt: manager.getNeedsUnlock() });
    },
    stopBgm: () => manager.stopBgm(),
    playSfx: (id: SfxId, opts?: PlaySfxOptions) => {
      const asset = sfxAssets[id];
      manager.playSfx(asset.url, opts).then(
        () => void 0,
        () => void 0
      );
      set({ unlockPrompt: manager.getNeedsUnlock() });
    },
    enqueueVoiceText: (text, opts) => {
      manager.enqueueVoice({
        kind: 'tts',
        text,
        priority: opts?.priority ?? 0,
        interrupt: opts?.interrupt ?? false,
        dedupeKey: opts?.dedupeKey,
        cooldownMs: opts?.cooldownMs,
        rate: opts?.rate,
        pitch: opts?.pitch,
      });
      set({ unlockPrompt: manager.getNeedsUnlock() });
    },
    clearVoiceQueue: () => manager.clearVoiceQueue(),
    preloadCommon: () => {
      const urls = [
        sfxAssets.click.url,
        sfxAssets.ding.url,
        sfxAssets.chip.url,
        sfxAssets.dice.url,
        sfxAssets.whoosh.url,
        sfxAssets.flip.url,
        sfxAssets.bet_touzi.url,
        sfxAssets.bet_cha.url,
        sfxAssets.bet_liangdao.url,
        sfxAssets.bet_sandao.url,
        sfxAssets.bet_duizi.url,
        sfxAssets.bet_hong.url,
        bgmAssets.lobby.url,
        bgmAssets.room.url,
      ];
      manager.preload(urls).then(
        () => void 0,
        () => void 0
      );
    },
    onVisibility: hidden => {
      manager.onVisibilityChange(hidden);
    },
  };
});
