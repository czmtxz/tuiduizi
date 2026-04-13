import { create } from 'zustand';
import { supabase, type Database, type Json } from '../lib/supabase';
import { 
  initDeck, 
  shuffleDeck, 
  rollDice, 
  getStartPos, 
  Card,
  Position,
  PlayerResult
} from '../utils/gameLogic';
import { computeBankerOutcomeLabel, computeBetProfit, type BetRow } from '../utils/bettingRules';
import { positionLabel } from '../utils/labels';
import { buildHandsByRound, buildResultsFromHands, encodeHandCards } from '../utils/revealFlow';
import { ensureCoreGameSchemaReady } from '../lib/schemaHealth';
import { toSupabaseError } from '../lib/supabaseError';
import {
  finishDeal,
  getMyRoundHand,
  getRoundHandsPublic,
  revealBatch,
  revealMine,
  revealSelf,
  revealSingle,
  settleRound,
  startDealWithHands,
  type RoundHandPrivateRow,
  type RoundHandPublicRow,
} from '../lib/revealFlowApi';

type RoomRow = Database['public']['Tables']['rooms']['Row'];
type PlayerRow = Database['public']['Tables']['players']['Row'];
type RoundRow = Database['public']['Tables']['rounds']['Row'];
type RoomMessageRow = Database['public']['Tables']['room_messages']['Row'];
type RoomInviteRow = Database['public']['Tables']['room_invites']['Row'];

export interface RoundSettlement {
  roundNumber: number;
  outcomeLabel: string;
  compareLoseCount: number;
  compareWinCount: number;
  deltas: Record<Position, number>;
  balances: Record<Position, number>;
  betDetailsByPosition?: Record<Position, BetDetail[]>;
}

export interface BetDetail {
  betId: string;
  betType: BetRow['bet_type'];
  position: Position;
  crossPositions?: DoorPosition[];
  amount: number;
  profitLoss: number;
}

export interface RevealRecord {
  index: number;
  gameNo: number;
  roundNo: number;
  phrase: string;
  outcomeLabel: string;
}

export type DoorPosition = Exclude<Position, 'banker'>;

async function buildWinnerPayload(
  currentRound: RoundRow,
  players: PlayerRow[],
  balances: Record<Position, number>,
  revealHistory: RevealRecord[],
  room: RoomRow | null,
  gameNo: number,
  completeResults: Record<Position, PlayerResult>
) {
  const deltas: Record<Position, number> = { banker: 0, chumen: 0, zhongmen: 0, momen: 0 };
  const playerIdToPos = new Map<string, Position>();
  for (const p of players) {
    if (p.position) playerIdToPos.set(p.id, p.position);
  }

  const { data: betRows, error: betError } = await supabase
    .from('bets')
    .select('*')
    .eq('round_id', currentRound.id);
  if (betError) throw betError;

  const betProfits = new Map<string, number>();
  const betDetailsByPosition: Record<Position, BetDetail[]> = {
    banker: [],
    chumen: [],
    zhongmen: [],
    momen: [],
  };

  for (const bet of (betRows || []) as BetRow[]) {
    const bettorPos = playerIdToPos.get(bet.player_id);
    if (!bettorPos) continue;
    const profit = computeBetProfit(bet, completeResults);
    betProfits.set(bet.id, profit);
    deltas[bettorPos] += profit;

    const cross = Array.isArray(bet.cross_positions) ? (bet.cross_positions as unknown[]) : [];
    const doors = cross.filter((x): x is DoorPosition => x === 'chumen' || x === 'zhongmen' || x === 'momen');
    betDetailsByPosition[bettorPos].push({
      betId: bet.id,
      betType: bet.bet_type,
      position: bet.position,
      crossPositions: bet.bet_type === 'cha' && doors.length === 2 ? doors : undefined,
      amount: bet.amount,
      profitLoss: profit,
    });
  }

  deltas.banker = -(deltas.chumen + deltas.zhongmen + deltas.momen);

  if (betProfits.size > 0) {
    await Promise.all(
      Array.from(betProfits.entries()).map(([id, profit]) =>
        supabase.from('bets').update({ profit_loss: profit }).eq('id', id)
      )
    );
  }

  const nextBalances: Record<Position, number> = {
    banker: balances.banker + deltas.banker,
    chumen: balances.chumen + deltas.chumen,
    zhongmen: balances.zhongmen + deltas.zhongmen,
    momen: balances.momen + deltas.momen,
  };

  const outcome = computeBankerOutcomeLabel(completeResults);
  const settlement: RoundSettlement = {
    roundNumber: currentRound.round_number,
    outcomeLabel: outcome.label,
    compareLoseCount: outcome.loseCount,
    compareWinCount: outcome.winCount,
    deltas,
    balances: nextBalances,
    betDetailsByPosition,
  };

  const phrase =
    outcome.loseCount === 3
      ? '赔3'
      : outcome.loseCount === 2
        ? '赢1赔2'
        : outcome.loseCount === 1
          ? '赢2赔1'
          : '赢3';
  const nextIndex = (revealHistory[revealHistory.length - 1]?.index || 0) + 1;
  const nextReveal: RevealRecord = {
    index: nextIndex,
    gameNo,
    roundNo: settlement.roundNumber,
    phrase,
    outcomeLabel: settlement.outcomeLabel,
  };
  const nextRevealHistory = [...revealHistory, nextReveal];
  if (room?.join_code) {
    localStorage.setItem(`tuiduizi_reveal_history_${room.join_code}`, JSON.stringify(nextRevealHistory));
    localStorage.setItem(`tuiduizi_game_no_${room.join_code}`, String(gameNo));
  }

  return {
    winnerPayload: { results: completeResults, settlement } as unknown as Json,
    nextBalances,
    settlement,
    nextRevealHistory,
  };
}

export interface BetDisplayItem {
  betId: string;
  bettorId: string;
  bettorName: string;
  bettorPosition: Position | null;
  betType: BetRow['bet_type'];
  position: Position;
  amount: number;
  crossPositions?: DoorPosition[];
}

export interface BetDisplaySummary {
  perDoor: Record<DoorPosition, { total: number; byType: Record<string, number>; items: BetDisplayItem[] }>;
  cross: Record<'CZ' | 'ZM' | 'MC', { label: string; total: number; items: BetDisplayItem[] }>;
}

interface GameState {
  room: RoomRow | null;
  players: PlayerRow[];
  currentPlayer: PlayerRow | null;
  currentRound: RoundRow | null;
  deck: Card[];
  isRolling: boolean;
  dice: [number, number];
  startPos: Position | null;
  results: Record<Position, PlayerResult | null>;
  history: unknown[];
  balances: Record<Position, number>;
  settlements: RoundSettlement[];
  betStatus: Record<Position, boolean>;
  gameNo: number;
  revealHistory: RevealRecord[];
  betDisplay: BetDisplaySummary;
  roundHandsPublic: Partial<Record<Position, RoundHandPublicRow>>;
  myRoundHand: RoundHandPrivateRow | null;

  messages: RoomMessageRow[];

  heartbeat: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  sendSystemMessage: (content: string) => Promise<void>;
  forceReady: (playerId: string) => Promise<void>;
  kickPlayer: (playerId: string) => Promise<void>;
  forceReadyAll: () => Promise<void>;
  leaveRoom: () => Promise<void>;
  dissolveRoom: () => Promise<void>;
  exitRoomLocal: () => void;

  createRoomInvite: () => Promise<void>;
  invites: RoomInviteRow[];
  refreshInvites: () => Promise<void>;
  autoFillMissingBets: () => Promise<void>;
  autoTakeoverStalePlayers: (staleMs: number) => Promise<void>;
  autoFillAISeats: () => Promise<void>;
  
  // Actions
  joinRoom: (joinCode: string, name: string, role: 'banker' | 'player') => Promise<void>;
  createRoom: (
    name: string,
    config: {
      joinCode?: string;
      maxBet: number;
      betStep: number;
      touziMin: number;
      touziMax: number;
      chaMin: number;
      chaMax: number;
      allowHong: boolean;
      hongMin: number;
      hongMax: number;
    }
  ) => Promise<void>;
  addAIPlayers: () => Promise<void>;
  setRoomAIEnabled: (enabled: boolean) => Promise<void>;
  setReady: () => Promise<void>;
  cancelReady: () => Promise<void>;
  startGame: () => Promise<void>;
  rollDiceAction: () => Promise<void>;
  betDoneFlow: () => Promise<void>;
  betCloseFlow: () => Promise<void>;
  dealCards: () => Promise<void>;
  finishRound: (continueToNext: boolean) => Promise<void>;
  refreshPlayers: () => Promise<void>;
  refreshRound: () => Promise<void>;
  refreshRoundHands: () => Promise<void>;
  refreshBetStatus: () => Promise<void>;
  refreshBets: () => Promise<void>;
  clearRevealHistory: () => void;
  startDealFlow: () => Promise<void>;
  finishDealFlow: () => Promise<void>;
  revealSingleFlow: (position: Position) => Promise<void>;
  revealBatchFlow: (positions: Position[]) => Promise<void>;
  revealSelfFlow: () => Promise<void>;
  revealMineFlow: () => Promise<void>;
}

export const useGame = create<GameState>((set, get) => {
  let cachedAllowGuest: boolean | null = null;
  let cachedAllowGuestAt = 0;
  let refreshRoundSeq = 0;
  let cachedRoomAt = 0;
  const getAllowGuest = async () => {
    const now = Date.now();
    if (cachedAllowGuest !== null && now - cachedAllowGuestAt < 10_000) return cachedAllowGuest;
    const { data } = await supabase
      .from('app_settings')
      .select('allow_guest')
      .eq('id', 1)
      .maybeSingle();
    const allow = data?.allow_guest ?? true;
    cachedAllowGuest = allow;
    cachedAllowGuestAt = now;
    return allow;
  };

  const requireAuthedUser = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      return auth.user;
    }

    const allowGuest = await getAllowGuest();
    if (!allowGuest) {
      throw new Error('当前已关闭游客模式，请先登录/注册后再进入');
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      throw new Error('游客身份初始化失败：请在 Supabase 后台启用 Anonymous sign-ins，或关闭游客模式并要求登录');
    }
    return data.user;
  };

  const ensureCurrentPlayerBoundToAuth = async () => {
    const { currentPlayer, players } = get();
    if (!currentPlayer) {
      throw new Error('当前玩家不存在，请重新进入房间');
    }

    const user = await requireAuthedUser();
    if (currentPlayer.user_id === user.id) return user;

    if (currentPlayer.user_id && currentPlayer.user_id !== user.id) {
      throw new Error('当前角色与登录账号不匹配，请退出房间后重新进入');
    }

    const conflicting = players.find(
      p => p.id !== currentPlayer.id && p.user_id === user.id && p.is_active !== false
    );
    if (conflicting) {
      throw new Error('当前账号已占用本房间其他角色，请退出房间后重新进入');
    }

    const { error } = await supabase
      .from('players')
      .update({ user_id: user.id })
      .eq('id', currentPlayer.id)
      .is('user_id', null);
    if (error) throw toSupabaseError(error, '绑定当前玩家身份失败');

    const nextCurrentPlayer = { ...currentPlayer, user_id: user.id } as PlayerRow;
    const nextPlayers = players.map(p => (p.id === currentPlayer.id ? nextCurrentPlayer : p));
    set({ currentPlayer: nextCurrentPlayer, players: nextPlayers });
    return user;
  };

  return ({
  room: null,
  players: [],
  currentPlayer: null,
  currentRound: null,
  deck: [],
  isRolling: false,
  dice: [1, 1],
  startPos: null,
  results: {
    banker: null,
    chumen: null,
    zhongmen: null,
    momen: null,
  },
  history: [],
  balances: { banker: 0, chumen: 0, zhongmen: 0, momen: 0 },
  settlements: [],
  betStatus: { banker: true, chumen: false, zhongmen: false, momen: false },
  gameNo: 1,
  revealHistory: [],
  betDisplay: {
    perDoor: {
      chumen: { total: 0, byType: {}, items: [] },
      zhongmen: { total: 0, byType: {}, items: [] },
      momen: { total: 0, byType: {}, items: [] },
    },
    cross: {
      CZ: { label: '出中叉', total: 0, items: [] },
      ZM: { label: '中末叉', total: 0, items: [] },
      MC: { label: '末出叉', total: 0, items: [] },
    },
  },
  roundHandsPublic: {},
  myRoundHand: null,

  messages: [],
  invites: [],

  heartbeat: async () => {
    const { currentPlayer } = get();
    if (!currentPlayer) return;
    await supabase
      .from('players')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentPlayer.id);
  },

  refreshMessages: async () => {
    const { room } = get();
    if (!room) return;
    const { data } = await supabase
      .from('room_messages')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(80);
    const rows = (data || []) as RoomMessageRow[];
    set({ messages: rows.slice().reverse() });
  },

  sendMessage: async (content) => {
    const { room, currentPlayer } = get();
    if (!room || !currentPlayer) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from('room_messages')
      .insert({ room_id: room.id, player_id: currentPlayer.id, sender_name: currentPlayer.name, content: trimmed });
    if (error) throw toSupabaseError(error, '开始失败');
    await get().refreshMessages();
  },

  sendSystemMessage: async (content) => {
    const { room } = get();
    if (!room) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from('room_messages')
      .insert({ room_id: room.id, player_id: null, sender_name: '系统', content: trimmed });
    if (error) throw toSupabaseError(error, '发牌失败');
    await get().refreshMessages();
  },

  forceReady: async (playerId) => {
    const { room, currentPlayer } = get();
    if (!room) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以操作');
    const { error } = await supabase.from('players').update({ is_ready: true }).eq('id', playerId).eq('room_id', room.id);
    if (error) throw toSupabaseError(error, '结束发牌失败');
    await get().refreshPlayers();
  },

  kickPlayer: async (playerId) => {
    const { room, currentPlayer } = get();
    if (!room) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以操作');
    if (currentPlayer.id === playerId) throw new Error('不能踢出自己');
    const { error } = await supabase
      .from('players')
      .update({ is_active: false, left_at: new Date().toISOString(), position: null, is_ready: false })
      .eq('id', playerId)
      .eq('room_id', room.id);
    if (error) throw toSupabaseError(error, '开牌失败');
    await get().refreshPlayers();
  },

  forceReadyAll: async () => {
    const { room, currentPlayer } = get();
    if (!room) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以操作');
    const { error } = await supabase
      .from('players')
      .update({ is_ready: true })
      .eq('room_id', room.id)
      .eq('is_active', true);
    if (error) throw toSupabaseError(error, '批量开牌失败');
    await get().sendSystemMessage('庄家已一键全部准备');
    await get().refreshPlayers();
  },

  leaveRoom: async () => {
    const { room, currentPlayer } = get();
    if (!room || !currentPlayer) return;
    await supabase
      .from('players')
      .update({ is_active: false, left_at: new Date().toISOString(), position: null, is_ready: false })
      .eq('id', currentPlayer.id)
      .eq('room_id', room.id);
    set({ room: null, currentPlayer: null, players: [], currentRound: null, startPos: null, dice: [1, 1], results: { banker: null, chumen: null, zhongmen: null, momen: null }, settlements: [], roundHandsPublic: {}, myRoundHand: null });

    localStorage.removeItem('tuiduizi_last_join_code');
    localStorage.removeItem('tuiduizi_last_role');
  },

  dissolveRoom: async () => {
    const { room, currentPlayer } = get();
    if (!room) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以解散');
    const { error } = await supabase.from('rooms').delete().eq('id', room.id);
    if (error) throw error;
    set({ room: null, currentPlayer: null, players: [], currentRound: null, startPos: null, dice: [1, 1], results: { banker: null, chumen: null, zhongmen: null, momen: null }, settlements: [], messages: [], invites: [], roundHandsPublic: {}, myRoundHand: null });

    localStorage.removeItem('tuiduizi_last_join_code');
    localStorage.removeItem('tuiduizi_last_role');
  },

  exitRoomLocal: () => {
    set({ room: null, currentPlayer: null, players: [], currentRound: null, startPos: null, dice: [1, 1], results: { banker: null, chumen: null, zhongmen: null, momen: null }, settlements: [], messages: [], invites: [], roundHandsPublic: {}, myRoundHand: null });
  },

  createRoomInvite: async () => {
    const { room, currentPlayer } = get();
    if (!room || !currentPlayer) return;
    if (currentPlayer.role !== 'banker') throw new Error('只有庄家可以邀请');
    await supabase
      .from('room_invites')
      .update({ status: 'closed', accepted_at: new Date().toISOString() })
      .eq('room_id', room.id)
      .eq('status', 'open');

    const { error } = await supabase.from('room_invites').insert({
      room_id: room.id,
      join_code: room.join_code,
      status: 'open',
      inviter_player_id: currentPlayer.id,
      max_bet: room.max_bet,
      bet_step: room.bet_step,
      touzi_min_bet: room.touzi_min_bet,
      touzi_max_bet: room.touzi_max_bet,
      cha_min_bet: room.cha_min_bet,
      cha_max_bet: room.cha_max_bet,
      allow_hong: room.allow_hong,
      hong_min_bet: room.hong_min_bet,
      hong_max_bet: room.hong_max_bet,
    });
    if (error) throw error;
    await get().sendSystemMessage('庄家已发送邀请，等待新玩家加入');
  },

  refreshInvites: async () => {
    const { data } = await supabase
      .from('room_invites')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);
    set({ invites: (data || []) as RoomInviteRow[] });
  },

  autoFillAISeats: async () => {
    return;
  },

  autoTakeoverStalePlayers: async (staleMs) => {
    const { currentPlayer, room } = get();
    if (!room || !room.ai_enabled || currentPlayer?.role !== 'banker') return;

    const { data } = await supabase.from('players').select('*').eq('room_id', room.id);
    const players = ((data || []) as PlayerRow[]).filter(p => p.is_active !== false);
    const now = Date.now();

    const toTakeover = players.filter(p => {
      if (!p.position || p.position === 'banker') return false;
      if (typeof p.name === 'string' && p.name.includes('电脑')) return false;
      const t = Date.parse(p.updated_at);
      if (!Number.isFinite(t)) return false;
      return now - t > staleMs;
    });

    if (toTakeover.length === 0) return;

    await Promise.all(
      toTakeover.map(p =>
        supabase
          .from('players')
          .update({ name: `电脑接管${positionLabel(p.position)}`, is_ready: true, updated_at: new Date().toISOString() })
          .eq('id', p.id)
      )
    );
    await get().refreshPlayers();
  },

  autoFillMissingBets: async () => {
    const { currentPlayer, room, currentRound, startPos } = get();
    if (!room || !room.ai_enabled || !currentRound) return;
    if (startPos) return;
    if (currentPlayer?.role !== 'banker') return;

    const { data: playersData } = await supabase.from('players').select('*').eq('room_id', room.id);
    const players = ((playersData || []) as PlayerRow[]).filter(p => p.is_active !== false);

    const { data: betRows } = await supabase
      .from('bets')
      .select('player_id, bet_type, position')
      .eq('round_id', currentRound.id);

    const requiredTypes = new Set(['touzi', 'liangdao', 'sandao', 'duizi']);
    const minAmount = (room.touzi_min_bet as unknown as number) || 50;

    const inserts: Database['public']['Tables']['bets']['Insert'][] = [];
    for (const p of players) {
      if (!p.position || p.position === 'banker') continue;

      const ok = (betRows || []).some(
        (b: { player_id: string; bet_type: string; position: string }) =>
          b.player_id === p.id && b.position === p.position && requiredTypes.has(b.bet_type)
      );

      if (!ok) {
        inserts.push({
          round_id: currentRound.id,
          player_id: p.id,
          bet_type: 'touzi',
          position: p.position,
          amount: minAmount,
        });
      }
    }

    if (inserts.length > 0) {
      await supabase.from('bets').insert(inserts);
      await get().refreshBetStatus();
      await get().refreshBets();
    }
  },

  clearRevealHistory: () => {
    const joinCode = get().room?.join_code;
    if (joinCode) {
      localStorage.removeItem(`tuiduizi_reveal_history_${joinCode}`);
      localStorage.removeItem(`tuiduizi_game_no_${joinCode}`);
    }
    set({ revealHistory: [], gameNo: 1 });
  },

  refreshBets: async () => {
    const { currentRound, players } = get();
    if (!currentRound) return;

    const { data: betRows } = await supabase
      .from('bets')
      .select('id, player_id, bet_type, position, amount, cross_positions')
      .eq('round_id', currentRound.id);

    const playerById = new Map<string, PlayerRow>();
    for (const p of players) playerById.set(p.id, p);

    const summary: BetDisplaySummary = {
      perDoor: {
        chumen: { total: 0, byType: {}, items: [] },
        zhongmen: { total: 0, byType: {}, items: [] },
        momen: { total: 0, byType: {}, items: [] },
      },
      cross: {
        CZ: { label: '出中叉', total: 0, items: [] },
        ZM: { label: '中末叉', total: 0, items: [] },
        MC: { label: '末出叉', total: 0, items: [] },
      },
    };

    const toCrossKey = (a: DoorPosition, b: DoorPosition): 'CZ' | 'ZM' | 'MC' => {
      const pair = [a, b].sort().join('-');
      if (pair === ['chumen', 'zhongmen'].sort().join('-')) return 'CZ';
      if (pair === ['momen', 'zhongmen'].sort().join('-')) return 'ZM';
      return 'MC';
    };

    const rows = (betRows || []) as Array<{ id: string; player_id: string; bet_type: BetRow['bet_type']; position: Position; amount: number; cross_positions: Json | null }>;
    for (const r of rows) {
      const bettor = playerById.get(r.player_id);
      const item: BetDisplayItem = {
        betId: r.id,
        bettorId: r.player_id,
        bettorName: bettor?.name || r.player_id.slice(0, 6),
        bettorPosition: bettor?.position || null,
        betType: r.bet_type,
        position: r.position,
        amount: r.amount,
      };

      if (r.bet_type === 'cha') {
        const cross = Array.isArray(r.cross_positions) ? (r.cross_positions as unknown[]) : [];
        const doors = cross.filter((x): x is DoorPosition => x === 'chumen' || x === 'zhongmen' || x === 'momen');
        if (doors.length === 2) {
          item.crossPositions = doors;
          const key = toCrossKey(doors[0], doors[1]);
          summary.cross[key].items.push(item);
          summary.cross[key].total += r.amount;
        }
        continue;
      }

      if (r.position === 'chumen' || r.position === 'zhongmen' || r.position === 'momen') {
        const door = r.position;
        summary.perDoor[door].items.push(item);
        summary.perDoor[door].total += r.amount;
        summary.perDoor[door].byType[r.bet_type] = (summary.perDoor[door].byType[r.bet_type] || 0) + r.amount;
      }
    }

    set({ betDisplay: summary });
  },

  refreshPlayers: async () => {
    const { room } = get();
    if (!room) return;
    const { data: players } = await supabase.from('players').select('*').eq('room_id', room.id);
    if (players) {
      const rows = players as PlayerRow[];
      set({ players: rows.filter(p => p.is_active !== false) });
    }
  },

  refreshBetStatus: async () => {
    const { currentRound, players } = get();
    if (!currentRound) return;

    const { data: diceRow } = await supabase
      .from('rounds')
      .select('dice_points')
      .eq('id', currentRound.id)
      .single();
    const isLocked = !!diceRow?.dice_points;

    const { data: betRows } = await supabase
      .from('bets')
      .select('id, player_id, bet_type, position')
      .eq('round_id', currentRound.id);

    const byPlayer = new Map<string, boolean>();
    for (const b of (betRows || []) as Array<{ player_id: string }>) {
      byPlayer.set(b.player_id, true);
    }

    if (!isLocked) {
      const aiPlayers = players.filter(p => p.position && p.position !== 'banker' && p.name.includes('电脑'));
      const missingAi = aiPlayers.filter(p => !byPlayer.get(p.id));
      if (missingAi.length > 0) {
        const room = get().room;
        const roomMaxBet = room?.max_bet ?? 1000;
        const step = room?.bet_step ?? 50;
        const touziMin = room?.touzi_min_bet ?? step;
        const touziMax = Math.min(room?.touzi_max_bet ?? roomMaxBet, roomMaxBet);
        const chaMin = room?.cha_min_bet ?? step;
        const chaMax = Math.min(room?.cha_max_bet ?? roomMaxBet, roomMaxBet);
        const hongAllowed = room?.allow_hong ?? false;
        const hongMin = room?.hong_min_bet ?? step;
        const hongMax = Math.min(room?.hong_max_bet ?? roomMaxBet, roomMaxBet);

        const pickStepped = (min: number, max: number) => {
          const safeMin = Math.max(step, Math.min(min, max));
          const safeMax = Math.max(safeMin, max);
          const slots = Math.max(1, Math.floor((safeMax - safeMin) / step) + 1);
          const idx = Math.floor(Math.random() * slots);
          return safeMin + idx * step;
        };

        const pickTouziAmount = () => pickStepped(touziMin, touziMax);
        const pickChaAmount = () => pickStepped(chaMin, chaMax);
        const pickHongAmount = () => pickStepped(hongMin, hongMax);
        const chance = (p: number) => Math.random() < p;
        const crossOptions = [
          ['chumen', 'zhongmen'],
          ['zhongmen', 'momen'],
          ['momen', 'chumen'],
        ] as const;

        const inserts: Database['public']['Tables']['bets']['Insert'][] = [];
        for (const p of missingAi) {
          const selfPos = (p.position || 'chumen') as Position;
          const doors: Position[] = ['chumen', 'zhongmen', 'momen'];
          const baseType = (['touzi', 'liangdao', 'sandao'] as const)[Math.floor(Math.random() * 3)];

          const pickLianSanAmount = () => {
            const min100 = Math.ceil(touziMin / 100) * 100;
            const max100 = Math.floor(touziMax / 100) * 100;
            const safeMin = Math.max(100, min100);
            const safeMax = Math.max(safeMin, max100);
            const slots = Math.max(1, Math.floor((safeMax - safeMin) / 100) + 1);
            return safeMin + Math.floor(Math.random() * slots) * 100;
          };

          inserts.push({
            round_id: currentRound.id,
            player_id: p.id,
            bet_type: baseType,
            position: selfPos,
            amount: baseType === 'liangdao' || baseType === 'sandao' ? pickLianSanAmount() : pickTouziAmount(),
          });

          if (chance(0.35)) {
            const otherDoors = doors.filter((x): x is Position => x !== selfPos);
            const other = otherDoors[Math.floor(Math.random() * otherDoors.length)];
            inserts.push({
              round_id: currentRound.id,
              player_id: p.id,
              bet_type: 'touzi',
              position: other,
              amount: pickTouziAmount(),
            });
          }

          if (chance(0.25)) {
            const cross = crossOptions[Math.floor(Math.random() * crossOptions.length)];
            inserts.push({
              round_id: currentRound.id,
              player_id: p.id,
              bet_type: 'cha',
              position: selfPos,
              cross_positions: cross as unknown as Json,
              amount: pickChaAmount(),
            });
          }

          if (chance(0.15)) {
            const door = doors[Math.floor(Math.random() * doors.length)];
            inserts.push({
              round_id: currentRound.id,
              player_id: p.id,
              bet_type: 'duizi',
              position: door,
              amount: pickTouziAmount(),
            });
          }

          if (hongAllowed && chance(0.12)) {
            inserts.push({
              round_id: currentRound.id,
              player_id: p.id,
              bet_type: 'hong',
              position: selfPos,
              amount: pickHongAmount(),
            });
          }
        }

        if (inserts.length > 0) {
          await supabase.from('bets').insert(inserts);
        }
      }
    }

    const { data: betRows2 } = await supabase
      .from('bets')
      .select('player_id, bet_type, position')
      .eq('round_id', currentRound.id);

    const status: Record<Position, boolean> = { banker: true, chumen: false, zhongmen: false, momen: false };
    for (const p of players) {
      if (!p.position || p.position === 'banker') continue;
      const ok = (betRows2 || []).some(
        (b: { player_id: string; bet_type: string; position: string }) =>
          b.player_id === p.id &&
          b.position === p.position &&
          ['touzi', 'liangdao', 'sandao', 'duizi'].includes(b.bet_type)
      );
      status[p.position] = ok;
    }

    set({ betStatus: status });
  },

  refreshRound: async () => {
    const seq = ++refreshRoundSeq;
    const { room, currentPlayer } = get();
    if (!room) return;

    const now = Date.now();
    let effectiveRoom: RoomRow = room;
    if (now - cachedRoomAt > 5000) {
      cachedRoomAt = now;
      const { data: roomRow } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', room.id)
        .maybeSingle();
      if (seq !== refreshRoundSeq) return;
      if (roomRow) {
        effectiveRoom = roomRow as RoomRow;
        set({ room: roomRow as RoomRow });
      }
    }

    const { data: active } = await supabase
      .from('rounds')
      .select('*')
      .eq('room_id', room.id)
      .eq('status', 'active')
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (seq !== refreshRoundSeq) return;

    let selected = active;
    if (!selected && effectiveRoom.status === 'playing') {
      const { data: latest } = await supabase
        .from('rounds')
        .select('*')
        .eq('room_id', room.id)
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (seq !== refreshRoundSeq) return;
      selected = latest;
    }

    if (!selected) {
      if (effectiveRoom.status === 'playing' && currentPlayer?.role === 'banker') {
        try {
          await ensureCurrentPlayerBoundToAuth();
          await supabase.from('rooms').update({ status: 'waiting' }).eq('id', room.id);
          await supabase.from('players').update({ is_ready: false }).eq('room_id', room.id);
        } catch {
          void 0;
        }
      }
      if (seq !== refreshRoundSeq) return;
      set({
        currentRound: null,
        startPos: null,
        dice: [1, 1],
        results: { banker: null, chumen: null, zhongmen: null, momen: null },
        betStatus: { banker: true, chumen: false, zhongmen: false, momen: false },
      });
      return;
    }

    const currentRoundId = get().currentRound?.id || null;
    const switching = currentRoundId !== selected.id;
    if (switching) {
      set({
        currentRound: selected as RoundRow,
        startPos: null,
        dice: [1, 1],
        results: { banker: null, chumen: null, zhongmen: null, momen: null },
        betStatus: { banker: true, chumen: false, zhongmen: false, momen: false },
      });
    }

    const { data, error } = await supabase.from('rounds').select('*').eq('id', selected.id).single();
    if (error || !data) return;
    if (seq !== refreshRoundSeq) return;

    const nextState: Partial<GameState> = { currentRound: data as RoundRow };

    const dist = data.card_distribution as unknown;
    if (Array.isArray(dist)) {
      const asCards = dist as Array<{ id?: unknown; value?: unknown }>;
      const deckCards: Card[] = asCards
        .map((x) => ({ id: Number(x.id), value: Number(x.value) }))
        .filter((c) => Number.isFinite(c.id) && Number.isFinite(c.value) && c.value >= 1 && c.value <= 9);
      if (deckCards.length > 0) {
        nextState.deck = deckCards;
      }
    }

    const diceRaw = data.dice_points as unknown;
    if (diceRaw && Array.isArray(diceRaw) && diceRaw.length === 2) {
      const d0 = Number(diceRaw[0]);
      const d1 = Number(diceRaw[1]);
      if (Number.isFinite(d0) && Number.isFinite(d1)) {
        nextState.dice = [d0, d1];
        nextState.startPos = getStartPos(d0 + d1);
      }
    } else {
      nextState.startPos = null;
      nextState.dice = [1, 1];
    }

    const winner = data.winner_result as unknown;
    if (winner && typeof winner === 'object' && !Array.isArray(winner)) {
      const w = winner as Record<string, unknown>;
      const maybeResults = w.results;
      const maybeSettlement = w.settlement;
      if (maybeResults && typeof maybeResults === 'object') {
        nextState.results = maybeResults as unknown as Record<Position, PlayerResult | null>;
      }
      if (maybeSettlement && typeof maybeSettlement === 'object') {
        const s = maybeSettlement as unknown as RoundSettlement;
        nextState.balances = s.balances;
        nextState.settlements = [...get().settlements.filter(x => x.roundNumber !== s.roundNumber), s].sort((a, b) => a.roundNumber - b.roundNumber);
      }
    } else {
      nextState.results = { banker: null, chumen: null, zhongmen: null, momen: null };
    }

    set(nextState);

    if (switching) {
      await get().refreshBetStatus();
      await get().refreshBets();
    }

    await get().refreshRoundHands();
  },

  refreshRoundHands: async () => {
    const { currentRound, currentPlayer } = get();
    if (!currentRound) {
      set({ roundHandsPublic: {}, myRoundHand: null });
      return;
    }

    if (currentPlayer) {
      try {
        await ensureCurrentPlayerBoundToAuth();
      } catch {
        void 0;
      }
    }

    const [{ data: publicRows }, { data: privateRow }] = await Promise.all([
      getRoundHandsPublic(currentRound.id),
      getMyRoundHand(currentRound.id),
    ]);

    const roundHandsPublic: Partial<Record<Position, RoundHandPublicRow>> = {};
    for (const row of publicRows || []) {
      if (!row.position) continue;
      roundHandsPublic[row.position as Position] = {
        ...row,
        position: row.position as Position,
      } as RoundHandPublicRow;
    }

    set({
      roundHandsPublic,
      myRoundHand: privateRow,
    });
  },

  createRoom: async (name, config) => {
    const user = await requireAuthedUser();
    const userId = user.id;
    const normalized = (config.joinCode || '').trim().toUpperCase();
    const genJoinCode = () => {
      if (normalized) return normalized;
      return String(1000 + Math.floor(Math.random() * 9000));
    };

    let room: RoomRow | null = null;
    let joinCode = normalized;
    for (let attempt = 0; attempt < 20; attempt++) {
      joinCode = genJoinCode();

      const { count: existCount, error: existErr } = await supabase
        .from('rooms')
        .select('*', { count: 'exact', head: true })
        .eq('join_code', joinCode);
      if (existErr) throw existErr;
      if ((existCount || 0) > 0) {
        if (normalized) throw new Error('房间号已被占用，请更换一个');
        continue;
      }

      const { data, error: roomError } = await supabase
        .from('rooms')
        .insert({
          join_code: joinCode,
          max_bet: config.maxBet,
          status: 'waiting',
          bet_step: config.betStep,
          touzi_min_bet: config.touziMin,
          touzi_max_bet: config.touziMax,
          cha_min_bet: config.chaMin,
          cha_max_bet: config.chaMax,
          allow_hong: config.allowHong,
          hong_min_bet: config.hongMin,
          hong_max_bet: config.hongMax,
          ai_enabled: false,
        })
        .select()
        .single();

      if (!roomError && data) {
        room = data as RoomRow;
        break;
      }

      throw roomError;
    }

    if (!room) throw new Error('创建房间失败，请重试');

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ 
        room_id: room.id, 
        user_id: userId,
        name: '1号', 
        role: 'banker', 
        position: 'banker' 
      })
      .select()
      .single();

    if (playerError) throw playerError;

    await supabase.from('rooms').update({ banker_id: player.id }).eq('id', room.id);

    const savedHistory = localStorage.getItem(`tuiduizi_reveal_history_${room.join_code}`);
    const savedGameNo = localStorage.getItem(`tuiduizi_game_no_${room.join_code}`);
    set({
      room: room as RoomRow,
      currentPlayer: player as PlayerRow,
      players: [player as PlayerRow],
      revealHistory: savedHistory ? (JSON.parse(savedHistory) as RevealRecord[]) : [],
      gameNo: savedGameNo ? Number(savedGameNo) || 1 : 1,
    });

    localStorage.setItem('tuiduizi_last_join_code', room.join_code);
    localStorage.setItem('tuiduizi_last_role', 'banker');
  },

  joinRoom: async (joinCode, name, role) => {
    const user = await requireAuthedUser();
    const userId = user.id;
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('join_code', joinCode)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) throw new Error('房间号不存在');

    const availablePositions: Position[] = ['chumen', 'zhongmen', 'momen'];

    let player: PlayerRow | null = null;
    let players: PlayerRow[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', room.id);
      players = ((playersData || []) as PlayerRow[]).filter(p => p.is_active !== false);

      const existing = players
        .filter(p => p.user_id === userId)
        .sort((a, b) => {
          const at = Date.parse(String(a.updated_at || a.joined_at || ''));
          const bt = Date.parse(String(b.updated_at || b.joined_at || ''));
          return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
        })[0];
      if (existing && existing.position) {
        player = existing;
        break;
      }

      const takenPositions = players.filter(p => !!p.position).map(p => p.position);

      if (role === 'banker' && takenPositions.includes('banker')) {
        throw new Error('此房间已有庄家');
      }

      const seatedCount = players.filter(p => !!p.position).length;
      if (seatedCount >= 4) {
        throw new Error('房间已满');
      }

      const nextPos = role === 'banker' ? 'banker' : availablePositions.find(p => !takenPositions.includes(p));
      if (!nextPos) throw new Error('无法选择该角色或位置已满');

      let nextNo = 1;
      for (const p of players) {
        if (typeof p.name !== 'string') continue;
        if (p.name.includes('电脑')) continue;
        const m = /^(\d+)号$/.exec(p.name);
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isFinite(n)) nextNo = Math.max(nextNo, n + 1);
      }
      if (nextNo > 9999) nextNo = 9999;

      const { data: inserted, error: playerError } = await supabase
        .from('players')
        .insert({
          room_id: room.id,
          user_id: userId,
          name: role === 'banker' ? '1号' : `${nextNo}号`,
          role,
          position: nextPos,
        })
        .select()
        .single();

      if (!playerError && inserted) {
        player = inserted as PlayerRow;
        players = ([...players, player] as PlayerRow[]);
        break;
      }

      const code = (playerError as unknown as { code?: string } | null)?.code;
      if (code === '23505') {
        await new Promise(r => setTimeout(r, 80 + Math.floor(Math.random() * 120)));
        continue;
      }

      throw playerError;
    }

    if (!player) throw new Error('加入房间失败，请重试');

    if (role === 'banker') {
      await supabase.from('rooms').update({ banker_id: player.id }).eq('id', room.id);
    }

    const savedHistory = localStorage.getItem(`tuiduizi_reveal_history_${room.join_code}`);
    const savedGameNo = localStorage.getItem(`tuiduizi_game_no_${room.join_code}`);
    set({
      room: room as RoomRow,
      currentPlayer: player as PlayerRow,
      players: players as PlayerRow[],
      revealHistory: savedHistory ? (JSON.parse(savedHistory) as RevealRecord[]) : [],
      gameNo: savedGameNo ? Number(savedGameNo) || 1 : 1,
    });

    localStorage.setItem('tuiduizi_last_join_code', room.join_code);
    localStorage.setItem('tuiduizi_last_role', String(player.role || role || 'player'));

    await get().refreshRound();
    await get().refreshBetStatus();
    await get().refreshBets();
  },

  addAIPlayers: async () => {
    const { room, players } = get();
    if (!room || players.length >= 4) return;

    const takenPositions = players.map(p => p.position);
    const availablePositions: Position[] = ['chumen', 'zhongmen', 'momen'];
    const aiPositions = availablePositions.filter(p => !takenPositions.includes(p));

    const usedAiNos = new Set<number>();
    for (const p of players) {
      const m = /^电脑(\d+)号$/.exec(p.name);
      if (m) usedAiNos.add(Number(m[1]));
    }
    const pickAiNo = () => {
      for (let i = 1; i <= 4; i++) {
        if (!usedAiNos.has(i)) {
          usedAiNos.add(i);
          return i;
        }
      }
      const next = usedAiNos.size + 1;
      usedAiNos.add(next);
      return next;
    };

    const aiPlayers: Database['public']['Tables']['players']['Insert'][] = aiPositions.map(pos => ({
      room_id: room.id,
      name: `电脑${pickAiNo()}号`,
      role: 'player',
      position: pos,
      is_ready: true,
    }));

    const { error } = await supabase.from('players').insert(aiPlayers);
    if (error) throw error;
    
    await get().refreshPlayers();
  },

  setRoomAIEnabled: async (enabled) => {
    const { room, currentPlayer } = get();
    if (!room) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以设置');
    const { data, error } = await supabase
      .from('rooms')
      .update({ ai_enabled: enabled })
      .eq('id', room.id)
      .select()
      .single();
    if (error) throw error;
    set({ room: data as RoomRow });
  },

  setReady: async () => {
    const { currentPlayer, room } = get();
    if (!currentPlayer) return;

    await supabase
      .from('players')
      .update({ is_ready: true })
      .eq('id', currentPlayer.id);

    if (room) {
      await get().sendSystemMessage(`${currentPlayer.name} 已准备`);
    }
    
    await get().refreshPlayers();
  },

  cancelReady: async () => {
    const { currentPlayer, room } = get();
    if (!currentPlayer) return;
    await supabase.from('players').update({ is_ready: false }).eq('id', currentPlayer.id);
    if (room) {
      await get().sendSystemMessage(`${currentPlayer.name} 已取消准备`);
    }
    await get().refreshPlayers();
  },

  startGame: async () => {
    const { room, players, currentPlayer } = get();
    if (!room) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以开始');
    await ensureCoreGameSchemaReady();

    const seated = players.filter(
      p => p.is_active !== false && (p.position === 'banker' || p.position === 'chumen' || p.position === 'zhongmen' || p.position === 'momen')
    );
    const posSet = new Set(seated.map(p => p.position));
    const required: Array<'banker' | 'chumen' | 'zhongmen' | 'momen'> = ['banker', 'chumen', 'zhongmen', 'momen'];
    const missingPos = required.filter(p => !posSet.has(p));
    if (missingPos.length > 0) {
      throw new Error('请等待4个位置都有人就位');
    }

    const unready = seated.filter(p => !p.is_ready);
    if (unready.length > 0) {
      throw new Error('请等待所有玩家点击准备');
    }

    const deck = shuffleDeck(initDeck());
    
    const { data: round, error } = await supabase
      .from('rounds')
      .insert({
        room_id: room.id,
        round_number: 1,
        card_distribution: deck as unknown as Json,
        status: 'active',
        phase: 'betting',
        dealer_player_id: currentPlayer.id,
        all_revealed: false,
      })
      .select()
      .single();

    if (error) throw toSupabaseError(error, '开始失败');

    await supabase.from('rooms').update({ status: 'playing' }).eq('id', room.id);
    
    set({ currentRound: round as RoundRow, deck });
    await get().sendSystemMessage('游戏开始');
    await get().refreshBetStatus();
    await get().refreshBets();
  },

  rollDiceAction: async () => {
    const { currentRound } = get();
    if (!currentRound) return;

    const { data: existingDice } = await supabase
      .from('rounds')
      .select('dice_points, bet_done_chumen, bet_done_zhongmen, bet_done_momen, bet_closed_at')
      .eq('id', currentRound.id)
      .single();
    if (existingDice?.dice_points) throw new Error('已掷骰，下注已关闭');

    if (
      !existingDice?.bet_done_chumen ||
      !existingDice?.bet_done_zhongmen ||
      !existingDice?.bet_done_momen
    ) {
      throw new Error('闲家未买定离手，庄家不能掷骰；可点击“结束下注”强制封盘');
    }

    set({ isRolling: true });

    await Promise.all([get().refreshBetStatus(), get().refreshBets()]);
    const { betStatus } = get();
    const allRequiredDone = betStatus.chumen && betStatus.zhongmen && betStatus.momen;
    if (!allRequiredDone) {
      set({ isRolling: false });
      throw new Error('每位闲家必须至少下注自己这一门一次，完成后才能掷骰子');
    }

    await new Promise(resolve => setTimeout(resolve, 800));
    
    const dice = rollDice();
    const total = dice[0] + dice[1];
    const startPos = getStartPos(total);

    const { error: diceUpdateError } = await supabase
      .from('rounds')
      .update({ dice_points: dice as unknown as Json, phase: 'dice_done' })
      .eq('id', currentRound.id);
    if (diceUpdateError) throw toSupabaseError(diceUpdateError, '掷骰失败');

    set({ isRolling: false, dice, startPos });
    await get().refreshBetStatus();
    await get().refreshRound();
  },

  betDoneFlow: async () => {
    const { currentRound, currentPlayer } = get();
    if (!currentRound) return;
    if (currentRound.phase !== 'betting') throw new Error('当前不在下注阶段');
    if (currentPlayer?.role === 'banker') throw new Error('庄家无需买定离手');

    await get().refreshBetStatus();
    const { betStatus } = get();
    if (currentPlayer?.position && !betStatus[currentPlayer.position]) {
      throw new Error('请先下注本门一次');
    }

    await ensureCurrentPlayerBoundToAuth();
    const { error } = await supabase.rpc('rpc_round_bet_done', { p_round_id: currentRound.id });
    if (error) throw toSupabaseError(error, '买定离手失败');
    await get().refreshRound();
  },

  betCloseFlow: async () => {
    const { currentRound, currentPlayer } = get();
    if (!currentRound) return;
    if (currentRound.phase !== 'betting') throw new Error('当前不在下注阶段');
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以结束下注');
    await ensureCurrentPlayerBoundToAuth();
    const { error } = await supabase.rpc('rpc_round_bet_close', { p_round_id: currentRound.id });
    if (error) throw toSupabaseError(error, '结束下注失败');
    await get().refreshRound();
    await get().refreshBetStatus();
  },

  startDealFlow: async () => {
    const { currentRound, deck, startPos, room, players, currentPlayer } = get();
    if (!currentRound || !room || !startPos) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以发牌');
    await ensureCurrentPlayerBoundToAuth();
    if (currentRound.phase !== 'dice_done') throw new Error('当前还不能发牌');

    const handsByPos = buildHandsByRound(deck, startPos, currentRound.round_number);

    const ownerByPos = new Map<Position, string | null>();
    for (const p of players) {
      if (p.position) ownerByPos.set(p.position, p.id);
    }

    const payload = (['banker', 'chumen', 'zhongmen', 'momen'] as const).map(pos => ({
      position: pos,
      owner_player_id: ownerByPos.get(pos) || null,
      encrypted_hand: encodeHandCards(handsByPos[pos]),
      encrypted_iv: '',
      encrypted_tag: '',
    }));

    const { data: latestRound, error: latestRoundError } = await supabase
      .from('rounds')
      .select('id, phase, status')
      .eq('id', currentRound.id)
      .single();
    if (latestRoundError) throw toSupabaseError(latestRoundError, '读取牌局状态失败');
    if (latestRound.phase !== 'dice_done' || latestRound.status !== 'active') {
      await get().refreshRound();
      throw new Error(`当前牌局阶段为 ${latestRound.phase}，暂时不能发牌`);
    }

    const { error } = await startDealWithHands(room.id, currentRound.id, payload);
    if (error) throw toSupabaseError(error, '发牌失败');
    await get().refreshRound();
    await get().refreshRoundHands();
  },

  finishDealFlow: async () => {
    const { currentRound, currentPlayer } = get();
    if (!currentRound) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以结束发牌');
    await ensureCurrentPlayerBoundToAuth();
    const { error } = await finishDeal(currentRound.id);
    if (error) throw toSupabaseError(error, '结束发牌失败');
    await get().refreshRound();
    await get().refreshRoundHands();
  },

  revealSingleFlow: async (position) => {
    const { currentRound, room, currentPlayer } = get();
    if (!currentRound || !room) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以开牌');
    await ensureCurrentPlayerBoundToAuth();
    const { error, data } = await revealSingle(room.id, currentRound.id, position);
    if (error) throw toSupabaseError(error, '开牌失败');
    await get().refreshRoundHands();
    if (data?.all_revealed) {
      await get().revealSelfFlow();
      return;
    }
    await get().refreshRound();
  },

  revealBatchFlow: async (positions) => {
    const { currentRound, room, currentPlayer } = get();
    if (!currentRound || !room) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以批量开牌');
    await ensureCurrentPlayerBoundToAuth();
    const { error, data } = await revealBatch(room.id, currentRound.id, positions);
    if (error) throw toSupabaseError(error, '批量开牌失败');
    await get().refreshRound();
    await get().refreshRoundHands();
    if (data?.all_revealed) {
      await get().revealSelfFlow();
    }
  },

  revealSelfFlow: async () => {
    const { currentRound, room, currentPlayer, players, balances, revealHistory, gameNo } = get();
    if (!currentRound || !room) return;
    if (currentPlayer?.role !== 'banker') throw new Error('只有庄家可以开牌');
    await ensureCurrentPlayerBoundToAuth();

    const publicHandsBefore = await getRoundHandsPublic(currentRound.id);
    const bankerPublic = (publicHandsBefore.data || []).find(x => x.position === 'banker');
    if (!bankerPublic?.is_revealed) {
      const { error } = await revealSelf(room.id, currentRound.id);
      if (error) throw toSupabaseError(error, '亮庄失败');
    }

    const { data: publicRows, error: publicErr } = await getRoundHandsPublic(currentRound.id);
    if (publicErr) throw publicErr;
    const requiredPositions: Position[] = ['banker', 'chumen', 'zhongmen', 'momen'];
    const handsByPos = {} as Record<Position, Card[]>;
    for (const pos of requiredPositions) {
      const row = (publicRows || []).find(x => x.position === pos);
      if (!row?.is_revealed || !Array.isArray(row.public_hand)) {
        await get().refreshRound();
        await get().refreshRoundHands();
        return;
      }
      handsByPos[pos] = row.public_hand as unknown as Card[];
    }

    const completeResults = buildResultsFromHands(handsByPos);
    const { winnerPayload, nextBalances, settlement, nextRevealHistory } = await buildWinnerPayload(
      currentRound,
      players,
      balances,
      revealHistory,
      room,
      gameNo,
      completeResults
    );

    const { error: settleError } = await settleRound(currentRound.id, winnerPayload);
    if (settleError) throw settleError;

    set({
      results: completeResults,
      balances: nextBalances,
      settlements: [...get().settlements.filter(x => x.roundNumber !== settlement.roundNumber), settlement].sort((a, b) => a.roundNumber - b.roundNumber),
      revealHistory: nextRevealHistory,
    });
    await get().refreshRound();
    await get().refreshRoundHands();
  },

  dealCards: async () => {
    await get().startDealFlow();
  },

  finishRound: async (continueToNext) => {
    const { currentRound, room, deck, gameNo, currentPlayer } = get();
    if (!currentRound || !room) return;

    if (currentPlayer?.role !== 'banker') {
      throw new Error('只有庄家可以结束本轮');
    }

    await ensureCurrentPlayerBoundToAuth();

    if (continueToNext) {
      const nextRoundNum = currentRound.round_number + 1;
      const { data: nextRound, error: nextErr } = await supabase
        .from('rounds')
        .insert({
          room_id: room.id,
          round_number: nextRoundNum,
          card_distribution: deck as unknown as Json,
          status: 'active',
          phase: 'betting',
          dealer_player_id: currentRound.dealer_player_id,
          all_revealed: false,
        })
        .select()
        .single();

      if (nextErr || !nextRound) throw toSupabaseError(nextErr || new Error('创建下一轮失败'), '创建下一轮失败');

      const { error: completeErr } = await supabase
        .from('rounds')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', currentRound.id);
      if (completeErr) throw toSupabaseError(completeErr, '结束本轮失败');
      
      set({
        currentRound: nextRound as RoundRow,
        deck,
        results: { banker: null, chumen: null, zhongmen: null, momen: null },
        dice: [1, 1],
        startPos: null,
        roundHandsPublic: {},
        myRoundHand: null,
      });
      await get().refreshBetStatus();
      await get().refreshBets();
      await get().refreshRoundHands();
      await get().refreshRound();
    } else {
      const { error: completeErr } = await supabase
        .from('rounds')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', currentRound.id);
      if (completeErr) throw toSupabaseError(completeErr, '结束本轮失败');

      await supabase.from('rooms').update({ status: 'waiting' }).eq('id', room.id);
      await supabase.from('players').update({ is_ready: false }).eq('room_id', room.id);
      const nextGameNo = gameNo + 1;
      if (room.join_code) {
        localStorage.setItem(`tuiduizi_game_no_${room.join_code}`, String(nextGameNo));
      }
      set({
        currentRound: null,
        results: { banker: null, chumen: null, zhongmen: null, momen: null },
        startPos: null,
        dice: [1, 1],
        settlements: [],
        betStatus: { banker: true, chumen: false, zhongmen: false, momen: false },
        gameNo: nextGameNo,
        roundHandsPublic: {},
        myRoundHand: null,
      });
      await get().refreshPlayers();
    }
  },

  revealMineFlow: async () => {
    const { currentRound } = get();
    if (!currentRound) return;
    await ensureCurrentPlayerBoundToAuth();
    const { error } = await revealMine(currentRound.id);
    if (error) throw toSupabaseError(error, '亮牌失败');
    await get().refreshRound();
    await get().refreshRoundHands();
  },
  });
});
