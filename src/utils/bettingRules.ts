import type { Database, Json } from '../lib/supabase';
import { compareResults, type PlayerResult, type Position } from './gameLogic';

export type BetRow = Database['public']['Tables']['bets']['Row'];

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

const getCrossPositions = (cross: Json | null): Position[] => {
  if (!Array.isArray(cross)) return [];
  const out: Position[] = [];
  for (const v of cross) {
    if (v === 'banker' || v === 'chumen' || v === 'zhongmen' || v === 'momen') out.push(v);
  }
  return out;
};

export const computeBetProfit = (
  bet: BetRow,
  results: Record<Position, PlayerResult>
): number => {
  const banker = results.banker;
  const target = results[bet.position];

  if (!banker || !target) return 0;

  const targetWins = compareResults(target, banker);

  if (bet.bet_type === 'hong') {
    const { loseCount } = computeBankerOutcomeLabel(results);
    return loseCount === 3 ? bet.amount * 3 : -bet.amount;
  }

  if (bet.bet_type === 'cha') {
    const cross = getCrossPositions(bet.cross_positions);
    if (cross.length !== 2) return 0;
    const w1 = results[cross[0]] ? compareResults(results[cross[0]], banker) : false;
    const w2 = results[cross[1]] ? compareResults(results[cross[1]], banker) : false;
    if (w1 && w2) return bet.amount;
    if (!w1 && !w2) return -bet.amount;
    return 0;
  }

  if (bet.bet_type === 'touzi') {
    return targetWins ? bet.amount : -bet.amount;
  }

  if (bet.bet_type === 'liangdao') {
    const winner = targetWins ? target : banker;
    const winnerDao = getDaoLevelByResult(winner);
    const payout = winnerDao >= 2 ? bet.amount : liangdaoOneDaoPayout(bet.amount);
    return targetWins ? payout : -payout;
  }

  if (bet.bet_type === 'sandao') {
    if (targetWins) {
      const dao = getDaoLevelByResult(target);
      return Math.floor((bet.amount * dao) / 3);
    }
    const bankerDao = getDaoLevelByResult(banker);
    return -Math.floor((bet.amount * bankerDao) / 3);
  }

  if (bet.bet_type === 'duizi') {
    if (banker.isPair) return -bet.amount;
    if (target.isPair) return bet.amount;
    return 0;
  }

  return 0;
};

export const computeBankerOutcomeLabel = (
  results: Record<Position, PlayerResult>
): { loseCount: number; winCount: number; label: string } => {
  const banker = results.banker;
  let loseCount = 0;
  for (const pos of ['chumen', 'zhongmen', 'momen'] as const) {
    const playerWins = compareResults(results[pos], banker);
    if (playerWins) loseCount += 1;
  }
  const winCount = 3 - loseCount;
  let label = `赢${winCount}赔${loseCount}`;
  if (winCount === 3) label = '赢3';
  if (loseCount === 3) label = '赔3';
  return { loseCount, winCount, label };
};
