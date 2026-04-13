import React, { useEffect } from 'react';
import { useAudio } from './audioStore';

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const unlockAudio = useAudio(s => s.unlockAudio);
  const preloadCommon = useAudio(s => s.preloadCommon);
  const onVisibility = useAudio(s => s.onVisibility);

  useEffect(() => {
    preloadCommon();
  }, [preloadCommon]);

  useEffect(() => {
    const onPointer = () => {
      unlockAudio().then(
        () => void 0,
        () => void 0
      );
    };
    window.addEventListener('pointerdown', onPointer, { passive: true });
    window.addEventListener('keydown', onPointer);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onPointer);
    };
  }, [unlockAudio]);

  useEffect(() => {
    const onVis = () => {
      const hidden = document.visibilityState === 'hidden';
      onVisibility(hidden);
      if (!hidden) {
        unlockAudio().then(
          () => void 0,
          () => void 0
        );
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [onVisibility, unlockAudio]);

  return <>{children}</>;
};
