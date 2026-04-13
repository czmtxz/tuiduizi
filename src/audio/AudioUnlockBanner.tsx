import React from 'react';
import { useAudio } from './audioStore';

export const AudioUnlockBanner: React.FC = () => {
  const unlockPrompt = useAudio(s => s.unlockPrompt);
  const unlockAudio = useAudio(s => s.unlockAudio);
  const setPrefs = useAudio(s => s.setPrefs);

  if (!unlockPrompt) return null;

  return (
    <div className="mb-4 bg-black/30 border border-gold-500/20 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-black text-gold-500">需要点击启用声音</div>
          <div className="text-[10px] text-gray-400 mt-1 truncate">浏览器限制自动播放，点击后会启用背景音乐/音效/语音</div>
        </div>
        <div className="shrink-0 flex gap-2">
          <button
            onClick={() => {
              unlockAudio().then(
                () => void 0,
                () => void 0
              );
            }}
            className="bg-gold-500 hover:bg-yellow-400 text-black font-black text-xs px-3 py-2 rounded-xl"
          >
            启用声音
          </button>
          <button
            onClick={() => setPrefs({ muted: true })}
            className="bg-gray-900/60 hover:bg-gray-900 text-gray-200 font-black text-xs px-3 py-2 rounded-xl border border-white/10"
          >
            保持静音
          </button>
        </div>
      </div>
    </div>
  );
};

