/**
 * Core game logic for Mahjong Tui Dui Zi
 */

export type Position = 'banker' | 'chumen' | 'zhongmen' | 'momen';

export interface Card {
  id: number;
  value: number; // 1-9
}

export interface PlayerResult {
  position: Position;
  cards: Card[];
  points: number;
  isPair: boolean;
  maxSingle: number;
}

/**
 * Initialize a deck of 36 tiles (1-9 Tong, 4 each)
 */
export const initDeck = (): Card[] => {
  const deck: Card[] = [];
  let id = 0;
  for (let value = 1; value <= 9; value++) {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: id++, value });
    }
  }
  return deck;
};

/**
 * Shuffle the deck
 */
export const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Dice logic: 2 dice (1-6)
 */
export const rollDice = (): [number, number] => {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  return [d1, d2];
};

/**
 * Get the starting position based on dice total
 * Banker (庄家) = 1, 5, 9
 * Chumen (出门) = 2, 6, 10
 * Zhongmen (中门) = 3, 7, 11
 * Momen (末门) = 4, 8, 12
 */
export const getStartPos = (total: number): Position => {
  const mod = (total - 1) % 4;
  const positions: Position[] = ['banker', 'chumen', 'zhongmen', 'momen'];
  return positions[mod];
};

/**
 * Calculate point result for a pair of cards
 */
export const calculatePoints = (cards: Card[]): { points: number; isPair: boolean; maxSingle: number } => {
  if (cards.length === 0) return { points: 0, isPair: false, maxSingle: 0 };
  
  if (cards.length === 1) {
    return { points: cards[0].value, isPair: false, maxSingle: cards[0].value };
  }

  const [c1, c2] = cards;
  const isPair = c1.value === c2.value;
  const maxSingle = Math.max(c1.value, c2.value);
  const points = isPair ? c1.value : (c1.value + c2.value) % 10;
  
  return { points, isPair, maxSingle };
};

/**
 * Compare two results (Player vs Banker)
 * Returns true if the first player (usually闲家) wins, false if the second player (usually庄家) wins.
 * Ties go to the second player (Banker).
 */
export const compareResults = (player: PlayerResult, banker: PlayerResult): boolean => {
  // 1. Both are pairs
  if (player.isPair && banker.isPair) {
    // Both are pairs, higher pair wins. Banker wins ties.
    return player.points > banker.points;
  }
  
  // 2. One is a pair, the other is not
  if (player.isPair) return true;
  if (banker.isPair) return false;
  
  // 3. Both are not pairs
  if (player.points !== banker.points) {
    return player.points > banker.points;
  }
  
  // 4. Tied points, compare max single card
  if (player.maxSingle !== banker.maxSingle) {
    return player.maxSingle > banker.maxSingle;
  }
  
  // 5. Absolute tie, Banker wins
  return false;
};

/**
 * Betting logic: Calculate profit/loss based on rules
 */
export const calculateBetProfit = (
  betAmount: number,
  betType: string,
  playerRes: PlayerResult,
  bankerRes: PlayerResult,
  bankerWin: boolean // Is the player winning against banker?
): number => {
  if (betType === 'duizi') {
    if (bankerRes.isPair) return -betAmount;
    if (playerRes.isPair) return betAmount;
    return 0;
  }

  const getDaoLevel = (points: number): 1 | 2 | 3 => {
    if (points >= 8) return 3;
    if (points >= 4) return 2;
    return 1;
  };

  const getDaoLevelByResult = (res: PlayerResult): 1 | 2 | 3 => {
    if (res.isPair) return 3;
    return getDaoLevel(res.points);
  };

  const liangdaoOneDaoPayout = (amount: number): number => {
    const table: Record<number, number> = {
      100: 50,
      200: 100,
      300: 200,
      400: 200,
      500: 300,
    };
    if (amount in table) return table[amount];
    return Math.floor(amount / 2);
  };

  if (!bankerWin) {
    if (betType === 'liangdao') {
      const bankerDao = getDaoLevelByResult(bankerRes);
      const payout = bankerDao >= 2 ? betAmount : liangdaoOneDaoPayout(betAmount);
      return -payout;
    }
    if (betType === 'sandao') {
      const bankerDao = getDaoLevelByResult(bankerRes);
      return -Math.floor((betAmount * bankerDao) / 3);
    }
    return -betAmount;
  }
  
  // Player wins
  switch (betType) {
    case 'touzi':
      return betAmount;
    case 'liangdao':
      // "牌大于7点就属于两道小于7点就是一道，两道是下多少注赢多少，如果小于7点就是一道，比如下100赢50，下200赢100..."
      {
        const winnerDao = getDaoLevelByResult(playerRes);
        return winnerDao >= 2 ? betAmount : liangdaoOneDaoPayout(betAmount);
      }
    case 'sandao':
      // "大于7是三道，就是下多少赢多少输了的话看庄是几道。大于等于4是二道:压300如果赢的话就赢200，小于4是一道:压300一人100"
      {
        const dao = getDaoLevelByResult(playerRes);
        return Math.floor((betAmount * dao) / 3);
      }
    case 'duizi':
      // "对子道:意思就是说哪一门出牌出了对子和庄家比，胜出了之后，就是押多少赢多少"
      return playerRes.isPair ? betAmount : 0;
    default:
      return betAmount;
  }
};
