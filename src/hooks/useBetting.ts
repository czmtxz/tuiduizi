import { create } from 'zustand';
import { supabase, type Json } from '../lib/supabase';
import { Position, PlayerResult, compareResults } from '../utils/gameLogic';

export type BetType = 'touzi' | 'liangdao' | 'sandao' | 'cha' | 'duizi' | 'hong';

interface Bet {
  id: string;
  player_id: string;
  bet_type: BetType;
  position: Position;
  amount: number;
  cross_positions?: Json | null;
  profit_loss: number;
}

interface BettingState {
  bets: Bet[];
  maxBet: number;
  
  placeBet: (roundId: string, playerId: string, betType: BetType, position: Position, amount: number, crossPositions?: Position[]) => Promise<void>;
  calculateSettlement: (roundId: string, results: Record<Position, PlayerResult>) => Promise<void>;
}

export const useBetting = create<BettingState>((set) => ({
  bets: [],
  maxBet: 1000,

  placeBet: async (roundId, playerId, betType, position, amount, crossPositions) => {
    const { data: round } = await supabase
      .from('rounds')
      .select('dice_points, room_id, bet_done_chumen, bet_done_zhongmen, bet_done_momen, bet_closed_at')
      .eq('id', roundId)
      .single();
    if (round?.dice_points) throw new Error('庄家已掷骰，下注已关闭');
    if (round?.bet_closed_at) throw new Error('本轮已封盘，下注已关闭');

    const { data: me } = await supabase
      .from('players')
      .select('position')
      .eq('id', playerId)
      .single();
    const myPos = me?.position as Position | null | undefined;
    const sealed =
      myPos === 'chumen'
        ? !!round?.bet_done_chumen
        : myPos === 'zhongmen'
          ? !!round?.bet_done_zhongmen
          : myPos === 'momen'
            ? !!round?.bet_done_momen
            : false;
    if (sealed) throw new Error('你已买定离手，本轮不可继续下注');

    const { data: roomRow, error: roomError } = await supabase
      .from('rooms')
      .select('max_bet, bet_step, touzi_min_bet, touzi_max_bet, cha_min_bet, cha_max_bet, allow_hong, hong_min_bet, hong_max_bet')
      .eq('id', round.room_id)
      .single();
    if (roomError || !roomRow) throw new Error('读取房间下注规则失败');

    const step = roomRow.bet_step || 50;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('下注金额不合法');
    if (betType === 'liangdao' || betType === 'sandao') {
      if (amount % 100 !== 0) throw new Error('两道/三道下注金额必须是 100 的倍数');
    } else {
      if (amount % step !== 0) throw new Error(`下注金额必须是 ${step} 的倍数`);
    }

    const maxCap = roomRow.max_bet;
    if (amount > maxCap) throw new Error(`下注金额不能超过上限 ${maxCap}`);

    let min = 50;
    let max = maxCap;
    if (betType === 'cha') {
      min = roomRow.cha_min_bet;
      max = roomRow.cha_max_bet;
    } else if (betType === 'hong') {
      if (!roomRow.allow_hong) throw new Error('本房间不接受赌红');
      min = roomRow.hong_min_bet;
      max = roomRow.hong_max_bet;
    } else {
      min = roomRow.touzi_min_bet;
      max = roomRow.touzi_max_bet;
    }

    if (amount < min || amount > max) throw new Error(`下注金额范围：${min} ~ ${max}`);

    if (betType === 'cha') {
      const cross = (crossPositions || []).filter(
        (p): p is Position => p === 'chumen' || p === 'zhongmen' || p === 'momen'
      );
      const uniq = Array.from(new Set(cross));
      if (uniq.length !== 2) throw new Error('叉注必须选择两门');
    }

    const { data: bet, error } = await supabase
      .from('bets')
      .insert({
        round_id: roundId,
        player_id: playerId,
        bet_type: betType,
        position,
        amount,
        cross_positions: betType === 'cha' ? ((crossPositions as unknown as Json) || null) : null,
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.rpc('rpc_log_bet_audio_event', {
      p_round_id: roundId,
      p_bet_type: betType,
      p_amount: amount,
      p_locale: typeof navigator !== 'undefined' ? navigator.language || 'zh-CN' : 'zh-CN',
    });
    
    set(state => ({ bets: [...state.bets, bet] }));
  },

  calculateSettlement: async (roundId, results) => {
    const { data: bets } = await supabase
      .from('bets')
      .select('*')
      .eq('round_id', roundId);

    if (!bets) return;

    const bankerRes = results.banker;
    if (!bankerRes) return;

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

    const updatedBets = bets.map(bet => {
      const pos = bet.position as Position;
      const playerRes = results[pos];
      if (!playerRes) return bet;

      let profit = 0;
      const playerWins = compareResults(playerRes, bankerRes);

      if (bet.bet_type === 'hong') {
        const loseCount = (['chumen', 'zhongmen', 'momen'] as const).reduce((acc, p) => {
          const r = results[p];
          if (r && compareResults(r, bankerRes)) return acc + 1;
          return acc;
        }, 0);
        profit = loseCount === 3 ? bet.amount * 3 : -bet.amount;
        return { ...bet, profit_loss: profit };
      }

      if (bet.bet_type === 'cha') {
        const crossPos = Array.isArray(bet.cross_positions) ? (bet.cross_positions as unknown as Position[]) : [];
        const winCount = crossPos.filter(p => results[p] && compareResults(results[p]!, bankerRes)).length;
        const lossCount = crossPos.length - winCount;
        
        if (winCount === 2) profit = bet.amount;
        else if (lossCount === 2) profit = -bet.amount;
        else profit = 0;
      } else {
        if (!playerWins) {
          if (bet.bet_type === 'duizi') {
            profit = bankerRes.isPair ? -bet.amount : 0;
          } else if (bet.bet_type === 'liangdao') {
            const bankerDao = getDaoLevelByResult(bankerRes);
            const payout = bankerDao >= 2 ? bet.amount : liangdaoOneDaoPayout(bet.amount);
            profit = -payout;
          } else if (bet.bet_type === 'sandao') {
            const bankerDao = getDaoLevelByResult(bankerRes);
            profit = -Math.floor((bet.amount * bankerDao) / 3);
          } else {
            profit = -bet.amount;
          }
        } else {
          switch (bet.bet_type) {
            case 'touzi':
              profit = bet.amount;
              break;
            case 'liangdao':
              {
                const winner = playerWins ? playerRes : bankerRes;
                const winnerDao = getDaoLevelByResult(winner);
                const payout = winnerDao >= 2 ? bet.amount : liangdaoOneDaoPayout(bet.amount);
                profit = payout;
              }
              break;
            case 'sandao':
              {
                const dao = getDaoLevelByResult(playerRes);
                profit = Math.floor((bet.amount * dao) / 3);
              }
              break;
            case 'duizi':
              profit = bankerRes.isPair ? -bet.amount : playerRes.isPair ? bet.amount : 0;
              break;
          }
        }
      }

      return { ...bet, profit_loss: profit };
    });

    // Update database
    for (const bet of updatedBets) {
      await supabase
        .from('bets')
        .update({ profit_loss: bet.profit_loss })
        .eq('id', bet.id);
    }

    set({ bets: updatedBets });
  }
}));
