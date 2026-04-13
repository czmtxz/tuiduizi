import type { SfxId } from './assets';

export type BetSyncBetType = 'touzi' | 'liangdao' | 'sandao' | 'cha' | 'duizi' | 'hong';

export type BetAudioEventRow = {
  id: string;
  bet_type: BetSyncBetType;
  amount: number;
  locale: string;
  scheduled_at: string;
  created_at: string;
};

export const getBetSyncSfxId = (betType: BetSyncBetType): SfxId => {
  switch (betType) {
    case 'touzi':
      return 'bet_touzi';
    case 'cha':
      return 'bet_cha';
    case 'liangdao':
      return 'bet_liangdao';
    case 'sandao':
      return 'bet_sandao';
    case 'duizi':
      return 'bet_duizi';
    case 'hong':
      return 'bet_hong';
  }
};

export const getBetSyncPlayback = (betType: BetSyncBetType, amount: number) => {
  const safeAmount = Math.max(10, amount);
  const tierRate = Math.max(0.8, Math.min(1.35, 0.86 + Math.log10(safeAmount) / 6));
  const detuneBase =
    betType === 'cha'
      ? -120
      : betType === 'liangdao'
        ? 80
        : betType === 'sandao'
          ? 160
          : betType === 'duizi'
            ? 220
            : betType === 'hong'
              ? 260
              : 0;

  return {
    playbackRate: tierRate,
    detune: detuneBase + Math.round(Math.log10(safeAmount) * 80),
    volume: Math.max(0.55, Math.min(0.95, 0.55 + Math.log10(safeAmount) / 8)),
  };
};

