import type { Position } from './gameLogic';

export const positionLabel = (pos: Position | null | undefined): string => {
  if (pos === 'banker') return '庄家';
  if (pos === 'chumen') return '出门';
  if (pos === 'zhongmen') return '中门';
  if (pos === 'momen') return '末门';
  return '-';
};

export const roleLabel = (role: 'banker' | 'player' | null | undefined): string => {
  if (role === 'banker') return '庄家';
  if (role === 'player') return '闲家';
  return '-';
};

