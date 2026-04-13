import { calculatePoints, type Card, type PlayerResult, type Position } from './gameLogic';

const encodeUtf8 = (value: string) => {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(value)));
  return Buffer.from(value, 'utf8').toString('base64');
};

const decodeUtf8 = (value: string) => {
  if (typeof atob === 'function') return decodeURIComponent(escape(atob(value)));
  return Buffer.from(value, 'base64').toString('utf8');
};

export const encodeHandCards = (cards: Card[]) => encodeUtf8(JSON.stringify(cards));

export const decodeHandCards = (encoded: string | null | undefined): Card[] => {
  if (!encoded) return [];
  try {
    return JSON.parse(decodeUtf8(encoded)) as Card[];
  } catch {
    return [];
  }
};

export const buildResultsFromHands = (handsByPos: Record<Position, Card[]>): Record<Position, PlayerResult> => {
  return {
    banker: { position: 'banker', cards: handsByPos.banker, ...calculatePoints(handsByPos.banker) },
    chumen: { position: 'chumen', cards: handsByPos.chumen, ...calculatePoints(handsByPos.chumen) },
    zhongmen: { position: 'zhongmen', cards: handsByPos.zhongmen, ...calculatePoints(handsByPos.zhongmen) },
    momen: { position: 'momen', cards: handsByPos.momen, ...calculatePoints(handsByPos.momen) },
  };
};

export const buildHandsByRound = (
  deck: Card[],
  startPos: Position,
  roundNumber: number
): Record<Position, Card[]> => {
  const roundIdx = roundNumber - 1;
  const isLastFour = roundNumber === 5;
  const positions: Position[] = ['banker', 'chumen', 'zhongmen', 'momen'];
  const startIndex = positions.indexOf(startPos);
  const handsByPos: Record<Position, Card[]> = {
    banker: [],
    chumen: [],
    zhongmen: [],
    momen: [],
  };

  if (isLastFour) {
    const lastFour = deck.slice(32, 36);
    for (let i = 0; i < 4; i++) {
      const pos = positions[(startIndex + i) % 4];
      handsByPos[pos] = [lastFour[i]];
    }
    return handsByPos;
  }

  const offset = roundIdx * 8;
  for (let i = 0; i < 4; i++) {
    const pos = positions[(startIndex + i) % 4];
    handsByPos[pos] = [deck[offset + i * 2], deck[offset + i * 2 + 1]];
  }
  return handsByPos;
};

