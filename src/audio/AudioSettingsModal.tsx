import React, { useMemo } from 'react';
import { X, Volume2, VolumeX, Music, Mic, Sparkles, Compass, Wand2, PartyPopper, Radio } from 'lucide-react';
import { useAudio } from './audioStore';

const pct = (v: number) => Math.round(v * 100);

export const AudioSettingsModal: React.FC = () => {
  const open = useAudio(s => s.settingsOpen);
  const setOpen = useAudio(s => s.setSettingsOpen);
  const prefs = useAudio(s => s.prefs);
  const setPrefs = useAudio(s => s.setPrefs);
  const restoreDefaults = useAudio(s => s.restoreDefaults);
  const playSfx = useAudio(s => s.playSfx);
  const enqueueVoiceText = useAudio(s => s.enqueueVoiceText);
  const clearVoiceQueue = useAudio(s => s.clearVoiceQueue);
  const onVisibility = useAudio(s => s.onVisibility);
  const unlockAudio = useAudio(s => s.unlockAudio);

  const rows = useMemo(
    () => [
      {
        key: 'masterVolume' as const,
        label: '主音量',
        icon: prefs.muted ? VolumeX : Volume2,
        value: prefs.masterVolume,
        onChange: (v: number) => setPrefs({ masterVolume: v, muted: v <= 0 ? true : prefs.muted }),
      },
      {
        key: 'sfxVolume' as const,
        label: '音效音量',
        icon: Sparkles,
        value: prefs.sfxVolume,
        onChange: (v: number) => setPrefs({ sfxVolume: v }),
      },
      {
        key: 'voiceVolume' as const,
        label: '语音音量',
        icon: Mic,
        value: prefs.voiceVolume,
        onChange: (v: number) => setPrefs({ voiceVolume: v }),
      },
    ],
    [prefs.masterVolume, prefs.muted, prefs.sfxVolume, prefs.voiceVolume, setPrefs]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-[520px] bg-gray-950 border border-white/10 rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="text-sm font-black text-gray-100">音频设置</div>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded-xl hover:bg-white/5 text-gray-300"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between gap-3 bg-black/25 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <Music className="w-4 h-4" />
                背景音乐
              </div>
              <button
                onClick={() => setPrefs({ bgmEnabled: !prefs.bgmEnabled })}
                className={`text-[10px] font-black px-3 py-1.5 rounded-full border transition ${
                  prefs.bgmEnabled
                    ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30'
                    : 'bg-gray-800/40 border-white/10 text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                {prefs.bgmEnabled ? '已开启' : '已关闭'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 bg-black/25 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <Sparkles className="w-4 h-4" />
                音效
              </div>
              <button
                onClick={() => setPrefs({ sfxEnabled: !prefs.sfxEnabled })}
                className={`text-[10px] font-black px-3 py-1.5 rounded-full border transition ${
                  prefs.sfxEnabled
                    ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30'
                    : 'bg-gray-800/40 border-white/10 text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                {prefs.sfxEnabled ? '已开启' : '已关闭'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 bg-black/25 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <Mic className="w-4 h-4" />
                语音
              </div>
              <button
                onClick={() => setPrefs({ voiceEnabled: !prefs.voiceEnabled })}
                className={`text-[10px] font-black px-3 py-1.5 rounded-full border transition ${
                  prefs.voiceEnabled
                    ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30'
                    : 'bg-gray-800/40 border-white/10 text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                {prefs.voiceEnabled ? '已开启' : '已关闭'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 bg-black/25 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <Compass className="w-4 h-4" />
                空间音效
              </div>
              <button
                onClick={() => setPrefs({ spatialEnabled: !prefs.spatialEnabled })}
                className={`text-[10px] font-black px-3 py-1.5 rounded-full border transition ${
                  prefs.spatialEnabled
                    ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30'
                    : 'bg-gray-800/40 border-white/10 text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                {prefs.spatialEnabled ? '已开启' : '已关闭'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 bg-black/25 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <Wand2 className="w-4 h-4" />
                变声器
              </div>
              <button
                onClick={() => setPrefs({ voiceFxEnabled: !prefs.voiceFxEnabled })}
                className={`text-[10px] font-black px-3 py-1.5 rounded-full border transition ${
                  prefs.voiceFxEnabled
                    ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30'
                    : 'bg-gray-800/40 border-white/10 text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                {prefs.voiceFxEnabled ? '已开启' : '已关闭'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 bg-black/25 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <PartyPopper className="w-4 h-4" />
                彩蛋语音
              </div>
              <button
                onClick={() => setPrefs({ easterEggEnabled: !prefs.easterEggEnabled })}
                className={`text-[10px] font-black px-3 py-1.5 rounded-full border transition ${
                  prefs.easterEggEnabled
                    ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30'
                    : 'bg-gray-800/40 border-white/10 text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                {prefs.easterEggEnabled ? '已开启' : '已关闭'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 bg-black/25 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <Radio className="w-4 h-4" />
                下注同步音效
              </div>
              <button
                onClick={() => setPrefs({ betSyncSfxEnabled: !prefs.betSyncSfxEnabled })}
                className={`text-[10px] font-black px-3 py-1.5 rounded-full border transition ${
                  prefs.betSyncSfxEnabled
                    ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30'
                    : 'bg-gray-800/40 border-white/10 text-gray-200 hover:bg-gray-800/60'
                }`}
              >
                {prefs.betSyncSfxEnabled ? '已开启' : '已关闭'}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {rows.map(r => {
              const Icon = r.icon;
              return (
                <div key={r.key} className="bg-black/25 border border-white/10 rounded-2xl px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                      <Icon className="w-4 h-4" />
                      {r.label}
                    </div>
                    <div className="text-[10px] text-gray-400">{pct(r.value)}%</div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={pct(r.value)}
                    onChange={e => r.onChange(Number(e.target.value) / 100)}
                    className="mt-2 w-full"
                  />
                </div>
              );
            })}
          </div>

          <div className="bg-black/25 border border-white/10 rounded-2xl px-4 py-3">
            <div className="text-xs font-bold text-gray-200">测试</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => playSfx('click')}
                className="text-[10px] font-black px-3 py-2 rounded-xl bg-gray-900/60 hover:bg-gray-900 text-gray-200 border border-white/10"
              >
                测试音效
              </button>
              <button
                onClick={() => enqueueVoiceText('测试语音：语音队列按顺序播报。', { priority: 1, dedupeKey: 'test-voice', cooldownMs: 500 })}
                className="text-[10px] font-black px-3 py-2 rounded-xl bg-gray-900/60 hover:bg-gray-900 text-gray-200 border border-white/10"
              >
                测试语音
              </button>
              <button
                onClick={() => clearVoiceQueue()}
                className="text-[10px] font-black px-3 py-2 rounded-xl bg-gray-900/60 hover:bg-gray-900 text-gray-200 border border-white/10"
              >
                清空语音队列
              </button>
              <button
                onClick={() => {
                  onVisibility(true);
                  window.setTimeout(() => {
                    onVisibility(false);
                    unlockAudio().then(
                      () => void 0,
                      () => void 0
                    );
                  }, 500);
                }}
                className="text-[10px] font-black px-3 py-2 rounded-xl bg-gray-900/60 hover:bg-gray-900 text-gray-200 border border-white/10"
              >
                测试中断恢复
              </button>
            </div>
            <div className="mt-2 text-[10px] text-gray-500">语音默认串行播报，高优先级可打断当前播报</div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-white/10">
          <button
            onClick={() => restoreDefaults()}
            className="text-[10px] font-black px-3 py-2 rounded-xl bg-gray-900/60 hover:bg-gray-900 text-gray-200 border border-white/10"
          >
            恢复默认
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-[10px] font-black px-3 py-2 rounded-xl bg-gold-500 hover:bg-yellow-400 text-black"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
