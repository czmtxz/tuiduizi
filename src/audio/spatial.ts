import type { Position } from '../utils/gameLogic';

export const seatPan = (pos: Position): number => {
  if (pos === 'momen') return -0.85;
  if (pos === 'zhongmen') return 0;
  if (pos === 'chumen') return 0.85;
  return 0;
};

