export type BgmId = 'lobby' | 'room';
export type SfxId =
  | 'click'
  | 'ding'
  | 'chip'
  | 'dice'
  | 'whoosh'
  | 'flip'
  | 'bet_touzi'
  | 'bet_cha'
  | 'bet_liangdao'
  | 'bet_sandao'
  | 'bet_duizi'
  | 'bet_hong';

export const bgmAssets: Record<BgmId, { url: string }> = {
  lobby: { url: '/audio/bgm_lobby.wav' },
  room: { url: '/audio/bgm_room.wav' },
};

export const sfxAssets: Record<SfxId, { url: string }> = {
  click: { url: '/audio/sfx_click.wav' },
  ding: { url: '/audio/sfx_ding.wav' },
  chip: { url: '/audio/sfx_chip.wav' },
  dice: { url: '/audio/sfx_dice.wav' },
  whoosh: { url: '/audio/sfx_whoosh.wav' },
  flip: { url: '/audio/sfx_flip.wav' },
  bet_touzi: { url: '/audio/sfx_bet_touzi.wav' },
  bet_cha: { url: '/audio/sfx_bet_cha.wav' },
  bet_liangdao: { url: '/audio/sfx_bet_liangdao.wav' },
  bet_sandao: { url: '/audio/sfx_bet_sandao.wav' },
  bet_duizi: { url: '/audio/sfx_bet_duizi.wav' },
  bet_hong: { url: '/audio/sfx_bet_hong.wav' },
};
