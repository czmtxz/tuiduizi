import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame, type BetDetail } from '../hooks/useGame';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import MahjongTile from './MahjongTile';
import Dice from './Dice';
import { calculatePoints, type Card, Position, compareResults, getStartPos } from '../utils/gameLogic';
import { useAudio } from '../audio/audioStore';
import { seatPan } from '../audio/spatial';
import { decodeHandCards } from '../utils/revealFlow';
import { CircleHelp, Mic, MicOff, Radio } from 'lucide-react';
import { useVoiceChat } from '../voice/useVoiceChat';
import { motion } from 'framer-motion';

const GameTable: React.FC = () => {
  const { 
    room, 
    players, 
    currentPlayer, 
    currentRound, 
    isRolling, 
    dice, 
    startPos, 
    deck,
    results,
    startGame,
    rollDiceAction,
    betDoneFlow,
    betCloseFlow,
    startDealFlow,
    finishDealFlow,
    revealSingleFlow,
    revealBatchFlow,
    revealSelfFlow,
    revealMineFlow,
    finishRound,
    addAIPlayers,
    setReady,
    refreshPlayers,
    refreshRound,
    refreshRoundHands,
    refreshBetStatus,
    refreshBets,
    heartbeat,
    messages,
    refreshMessages,
    sendMessage,
    sendSystemMessage,
    forceReady,
    forceReadyAll,
    cancelReady,
    kickPlayer,
    leaveRoom,
    dissolveRoom,
    createRoomInvite,
    exitRoomLocal,
    autoFillMissingBets,
    autoTakeoverStalePlayers,
    setRoomAIEnabled,
    balances,
    settlements,
    betStatus,
    revealHistory,
    clearRevealHistory,
    gameNo,
    betDisplay,
    roundHandsPublic,
    myRoundHand,
  } = useGame();

  const playSfx = useAudio(s => s.playSfx);
  const enqueueVoiceText = useAudio(s => s.enqueueVoiceText);
  const {
    providerKind,
    status: voiceStatus,
    muted: voiceMuted,
    micPermission,
    activeMembers: voiceMembers,
    activePenalty,
    error: voiceError,
    debugLogs: voiceDebugLogs,
    setError: setVoiceError,
    toggleVoice,
    toggleMute,
    reportVoiceMember,
  } = useVoiceChat(room?.id || null, currentPlayer?.id || null);

  const [chatText, setChatText] = useState('');
  const [batchRevealMode, setBatchRevealMode] = useState(false);
  const [batchSelections, setBatchSelections] = useState<Position[]>([]);
  const [voicePermissionHelpOpen, setVoicePermissionHelpOpen] = useState(false);
  const showVoiceDebugPanel = import.meta.env.DEV;
  const micPermissionLabel =
    micPermission === 'granted' ? '已允许' : micPermission === 'denied' ? '已拒绝' : '未决定';
  const micPermissionHint =
    micPermission === 'granted'
      ? '浏览器已允许当前站点使用麦克风'
      : micPermission === 'denied'
        ? '浏览器已拒绝当前站点麦克风，请点地址栏权限图标重新允许'
        : '浏览器尚未记录麦克风权限，首次开启语音时可能会弹出授权框';

  // Refresh players periodically when waiting
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (room) {
      interval = setInterval(refreshPlayers, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [room, currentRound, refreshPlayers]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (room && currentPlayer) {
      interval = setInterval(heartbeat, 8000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [room, currentPlayer, heartbeat]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (room) {
      refreshMessages();
      interval = setInterval(refreshMessages, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [room, refreshMessages]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (room) {
      refreshRound();
      interval = setInterval(refreshRound, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [room, refreshRound]);

  useEffect(() => {
    if (!room) return;
    const channel = supabase
      .channel(`room-reveal-flow-${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${room.id}` },
        () => {
          refreshRound();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'round_hands', filter: `room_id=eq.${room.id}` },
        () => {
          refreshRound();
          refreshRoundHands();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'round_operation_logs', filter: `room_id=eq.${room.id}` },
        () => {
          refreshRound();
          refreshMessages();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [room, refreshRound, refreshRoundHands, refreshMessages]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (room && !startPos) {
      interval = setInterval(refreshBetStatus, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [room, startPos, refreshBetStatus]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (room && !startPos) {
      interval = setInterval(refreshBets, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [room, startPos, refreshBets]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (room) {
      interval = setInterval(async () => {
        const { data } = await supabase.from('rooms').select('id').eq('id', room.id).maybeSingle();
        if (!data) exitRoomLocal();
      }, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [room, exitRoomLocal]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (room) {
      interval = setInterval(() => {
        supabase.rpc('cleanup_inactive_rooms').then(
          () => void 0,
          () => void 0
        );
      }, 60_000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [room]);

  const isBanker = currentPlayer?.role === 'banker';
  const latestRoundNumber = settlements.length ? settlements[settlements.length - 1].roundNumber : undefined;
  const roundNum = currentRound?.round_number ?? latestRoundNumber ?? 0;
  const seatedCount = useMemo(() => {
    const valid = new Set<Position>();
    for (const p of players) {
      if (p.is_active === false) continue;
      const pos = p.position as Position | null | undefined;
      if (pos === 'banker' || pos === 'chumen' || pos === 'zhongmen' || pos === 'momen') {
        valid.add(pos);
      }
    }
    return valid.size;
  }, [players]);

  const [myHandOpened, setMyHandOpened] = useState(false);
  useEffect(() => {
    setMyHandOpened(false);
  }, [currentRound?.id, currentPlayer?.id]);

  const [myHandActionLoading, setMyHandActionLoading] = useState<'open' | 'reveal' | null>(null);
  const [myHandActionError, setMyHandActionError] = useState<string | null>(null);
  useEffect(() => {
    setMyHandActionLoading(null);
    setMyHandActionError(null);
  }, [currentRound?.id, currentPlayer?.id]);

  const [dealCounts, setDealCounts] = useState<Record<Position, number>>({
    banker: 0,
    chumen: 0,
    zhongmen: 0,
    momen: 0,
  });
  const dealTimersRef = useRef<number[]>([]);
  useEffect(() => {
    for (const id of dealTimersRef.current) window.clearTimeout(id);
    dealTimersRef.current = [];

    if (!currentRound?.id || currentRound.phase !== 'dealing' || !startPos) return;

    setDealCounts({ banker: 0, chumen: 0, zhongmen: 0, momen: 0 });

    const orderAll: Position[] = ['banker', 'chumen', 'zhongmen', 'momen'];
    const startIndex = orderAll.indexOf(startPos);
    const order = [...orderAll.slice(startIndex), ...orderAll.slice(0, startIndex)];

    const steps = 4;
    for (let i = 0; i < steps; i += 1) {
      const timerId = window.setTimeout(() => {
        const pos = order[i % 4];
        setDealCounts(prev => ({
          ...prev,
          [pos]: 2,
        }));
      }, 220 + i * 220);
      dealTimersRef.current.push(timerId);
    }
  }, [currentRound?.id, currentRound?.phase, startPos]);

  useEffect(() => {
    if (!currentRound?.id) return;
    if (currentRound.phase === 'wait_reveal' || currentRound.phase === 'revealing') {
      setDealCounts({ banker: 2, chumen: 2, zhongmen: 2, momen: 2 });
    }
  }, [currentRound?.id, currentRound?.phase]);

  const diceTotal = useMemo(() => (dice?.[0] || 0) + (dice?.[1] || 0), [dice]);
  const startPosLabel = useMemo(() => {
    const pos = startPos || (diceTotal >= 2 ? getStartPos(diceTotal) : null);
    if (!pos) return '';
    if (pos === 'banker') return '庄家';
    if (pos === 'chumen') return '出门';
    if (pos === 'zhongmen') return '中门';
    return '末门';
  }, [startPos, diceTotal]);

  const allBetsDone = betStatus.chumen && betStatus.zhongmen && betStatus.momen;
  const allBetsSealed = useMemo(() => {
    if (!currentRound) return true;
    if (currentRound.phase !== 'betting') return true;
    return Boolean(
      currentRound.bet_done_chumen &&
        currentRound.bet_done_zhongmen &&
        currentRound.bet_done_momen
    );
  }, [currentRound]);

  const allReady = useMemo(() => {
    const required: Position[] = ['banker', 'chumen', 'zhongmen', 'momen'];
    const byPos = new Map<Position, { isReady: boolean }>();
    for (const p of players) {
      if (!p.position) continue;
      byPos.set(p.position as Position, { isReady: !!p.is_ready });
    }
    return required.every(pos => byPos.get(pos)?.isReady);
  }, [players]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (room && isBanker && room.ai_enabled) {
      interval = setInterval(async () => {
        await autoTakeoverStalePlayers(25_000);
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [room, isBanker, autoTakeoverStalePlayers]);

  const betTimeoutRoundIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentRound?.id || !room || !isBanker) return;
    if (startPos) return;
    if (!room.ai_enabled) return;
    if (betTimeoutRoundIdRef.current === currentRound.id) return;
    betTimeoutRoundIdRef.current = currentRound.id;

    const id = window.setTimeout(async () => {
      await autoFillMissingBets();
    }, 15_000);

    return () => {
      window.clearTimeout(id);
    };
  }, [currentRound?.id, room, isBanker, startPos, autoFillMissingBets]);

  const [revealedPositions, setRevealedPositions] = useState<Set<Position>>(new Set());
  const [isRevealing, setIsRevealing] = useState(false);

  useEffect(() => {
    setRevealedPositions(new Set());
    setIsRevealing(false);
  }, [currentRound?.id]);

  const remainingCounts = useMemo(() => {
    const deckSource =
      deck && deck.length > 0
        ? (deck as unknown[])
        : Array.isArray((currentRound as unknown as { card_distribution?: unknown })?.card_distribution)
          ? (((currentRound as unknown as { card_distribution?: unknown }).card_distribution as unknown[]) || [])
          : [];
    if (deckSource.length === 0) return null;

    const normalizeValue = (x: unknown) => {
      if (typeof x === 'number') return x;
      if (Array.isArray(x) && x.length >= 2) return Number(x[1]);
      if (x && typeof x === 'object') {
        const any = x as Record<string, unknown>;
        if (typeof any.value === 'number') return any.value;
        if (typeof any.value === 'string') return Number(any.value);
        if (typeof any.v === 'number') return any.v;
        if (typeof any.v === 'string') return Number(any.v);
      }
      return Number.NaN;
    };

    const normDeck = deckSource.map((x, idx) => ({ idx, value: normalizeValue(x) }));
    const validCount = normDeck.reduce((acc, c) => (c.value >= 1 && c.value <= 9 ? acc + 1 : acc), 0);
    if (validCount === 0) return null;

    const totalDeck = deckSource.length;
    const totalByValue: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    for (const c of normDeck) {
      const v = c.value;
      if (v >= 1 && v <= 9) totalByValue[v] += 1;
    }

    if (!currentRound) {
      return {
        remainingByValue: totalByValue,
        dealtByValue: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
        totalRemaining: totalDeck,
        totalDealt: 0,
        totalDeck,
      };
    }

    const phase = currentRound.phase;
    const rnRaw = (currentRound as unknown as { round_number?: unknown }).round_number;
    const rn = typeof rnRaw === 'number' ? rnRaw : Number(rnRaw);
    if (!Number.isFinite(rn) || rn <= 0) return null;

    const isDealt = phase !== 'betting' && phase !== 'dice_done';
    let usedCount = 0;
    if (rn >= 1 && rn <= 4) {
      usedCount = (isDealt ? rn : rn - 1) * 8;
    } else if (rn === 5) {
      usedCount = isDealt ? 36 : 32;
    } else {
      usedCount = totalDeck;
    }
    usedCount = Math.max(0, Math.min(totalDeck, usedCount));

    const remainingDeck = normDeck.slice(usedCount);
    const remainingByValue: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    for (const c of remainingDeck) {
      const v = c.value;
      if (v >= 1 && v <= 9) remainingByValue[v] += 1;
    }

    const dealtByValue: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      dealtByValue[v] = Math.max(0, (totalByValue[v] || 0) - (remainingByValue[v] || 0));
    }

    const totalRemaining = remainingDeck.length;
    const totalDealt = Math.max(0, totalDeck - totalRemaining);
    return { remainingByValue, dealtByValue, totalRemaining, totalDealt, totalDeck };
  }, [deck, currentRound]);

  const startPosRef = useRef<Position | null>(null);
  useEffect(() => {
    startPosRef.current = startPos;
  }, [startPos]);

  const allRevealed = useMemo(() => {
    return (['banker', 'chumen', 'zhongmen', 'momen'] as const).every(p => revealedPositions.has(p));
  }, [revealedPositions]);

  const bankerManageAvailable = useMemo(() => {
    if (!isBanker) return false;
    if (!currentRound) return true;
    return !!results.banker && allRevealed;
  }, [isBanker, currentRound, results.banker, allRevealed]);

  const bankerAutoSettleRoundIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentRound?.id) return;
    if (!isBanker) return;
    if (!allRevealed) return;
    if (results.banker) return;
    if (currentRound.phase !== 'wait_reveal' && currentRound.phase !== 'revealing') return;
    if (bankerAutoSettleRoundIdRef.current === currentRound.id) return;
    bankerAutoSettleRoundIdRef.current = currentRound.id;

    void (async () => {
      try {
        await revealSelfFlow();
      } catch (e) {
        bankerAutoSettleRoundIdRef.current = null;
        alert(e instanceof Error ? e.message : '结算失败');
      }
    })();
  }, [currentRound?.id, currentRound?.phase, isBanker, allRevealed, results.banker, revealSelfFlow]);

  useEffect(() => {
    const next = new Set<Position>();
    (['banker', 'chumen', 'zhongmen', 'momen'] as const).forEach(pos => {
      if (roundHandsPublic[pos]?.is_revealed) next.add(pos);
    });
    setRevealedPositions(next);
    setIsRevealing(currentRound?.phase === 'revealing' && next.size < 4);
  }, [roundHandsPublic, currentRound?.phase]);

  useEffect(() => {
    setBatchSelections([]);
    setBatchRevealMode(false);
  }, [currentRound?.id, currentRound?.phase]);

  const dealingRoundIdRef = useRef<string | null>(null);
  const [dealingFinishError, setDealingFinishError] = useState<string | null>(null);
  useEffect(() => {
    if (!currentRound?.id) return;
    if (currentRound.phase !== 'dealing') return;
    if (!isBanker) return;
    if (dealingRoundIdRef.current === currentRound.id) return;
    dealingRoundIdRef.current = currentRound.id;
    setDealingFinishError(null);

    const order: Position[] = (() => {
      const sp = startPosRef.current;
      if (!sp) return ['chumen', 'zhongmen', 'momen', 'banker'];
      const positions: Position[] = ['banker', 'chumen', 'zhongmen', 'momen'];
      const startIndex = positions.indexOf(sp);
      return Array.from({ length: 4 }, (_, i) => positions[(startIndex + i) % 4]);
    })();

    order.forEach((pos, idx) => {
      window.setTimeout(() => {
        playSfx('whoosh', { volume: 0.7, playbackRate: pos === 'banker' ? 0.9 : 1.05, pan: seatPan(pos) });
      }, idx * 280);
    });

    const id = window.setTimeout(async () => {
      try {
        await finishDealFlow();
      } catch (e) {
        setDealingFinishError(e instanceof Error ? e.message : '结束发牌失败');
      }
    }, 2200);

    return () => {
      window.clearTimeout(id);
    };
  }, [currentRound?.id, currentRound?.phase, isBanker, finishDealFlow, playSfx]);

  const betPromptRoundIdRef = useRef<string | null>(null);
  const betPromptRoundId = currentRound?.id || null;
  useEffect(() => {
    if (!betPromptRoundId) return;
    if (startPos) return;
    if (results.banker) return;
    if (betPromptRoundIdRef.current === betPromptRoundId) return;
    betPromptRoundIdRef.current = betPromptRoundId;
    enqueueVoiceText('买定离手，下注下注！', { priority: 2, interrupt: false, dedupeKey: `bet-${betPromptRoundId}`, cooldownMs: 60_000, pitch: 0.85, rate: 1.05 });
  }, [betPromptRoundId, startPos, results.banker, enqueueVoiceText]);

  const pointsAnnounceRoundIdRef = useRef<string | null>(null);
  const pointsRoundId = currentRound?.id || null;
  useEffect(() => {
    if (!pointsRoundId) return;
    if (!currentPlayer?.position) return;
    const myPos = currentPlayer.position;
    if (!revealedPositions.has(myPos)) return;
    const myRow = roundHandsPublic[myPos];
    const myCards = myRow?.is_revealed && Array.isArray(myRow.public_hand)
      ? (myRow.public_hand as unknown as Card[])
      : [];
    if (myCards.length < 2) return;
    const myRes = { position: myPos, cards: myCards, ...calculatePoints(myCards) };
    const key = `${pointsRoundId}-${myPos}`;
    if (pointsAnnounceRoundIdRef.current === key) return;
    pointsAnnounceRoundIdRef.current = key;

    const pitchBase = myRes.isPair ? 0.9 : 1.05;
    const pitch = pitchBase + (myRes.points - 5) * 0.04;
    const rate = myRes.isPair ? 0.95 : 1.02;

    const t = myRes.isPair ? `对${myRes.points}筒！` : `${myRes.points}点！`;
    enqueueVoiceText(t, { priority: 3, interrupt: false, dedupeKey: `points-${pointsRoundId}-${myPos}`, cooldownMs: 60_000, pitch, rate });
  }, [pointsRoundId, currentPlayer?.position, revealedPositions, roundHandsPublic, enqueueVoiceText]);

  const publicVoiceRoundRef = useRef<{ roundId: string; keys: Set<string> } | null>(null);
  useEffect(() => {
    if (!currentRound?.id) {
      publicVoiceRoundRef.current = null;
      return;
    }
    publicVoiceRoundRef.current = { roundId: currentRound.id, keys: new Set() };
  }, [currentRound?.id]);

  useEffect(() => {
    if (!currentRound?.id) return;
    if (!isBanker) return;
    const state = publicVoiceRoundRef.current;
    if (!state || state.roundId !== currentRound.id) return;

    const isPosPair = (pos: Position) => {
      if (!revealedPositions.has(pos)) return false;
      const row = roundHandsPublic[pos];
      const cards = row?.is_revealed && Array.isArray(row.public_hand)
        ? (row.public_hand as unknown as Card[])
        : [];
      if (cards.length < 2) return false;
      return calculatePoints(cards).isPair;
    };

    const bankerPair = isPosPair('banker');
    const doorPair = isPosPair('chumen') || isPosPair('zhongmen') || isPosPair('momen');
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    if (bankerPair && !state.keys.has('banker_pair')) {
      state.keys.add('banker_pair');
      const lines = ['庄家亮堂，大杀四方！', '庄家对子一亮，气势起来了！'];
      const t = pick(lines);
      supabase.rpc('rpc_log_voice_event', {
        p_round_id: currentRound.id,
        p_event_key: 'banker_pair',
        p_text: t,
        p_locale: typeof navigator !== 'undefined' ? navigator.language || 'zh-CN' : 'zh-CN',
      }).then(
        () => void 0,
        () => void 0
      );
    } else if (!bankerPair && doorPair && !state.keys.has('door_pair')) {
      state.keys.add('door_pair');
      const lines = ['对子一响，全部起飞！', '闲家对子一响，全部起飞！'];
      const t = pick(lines);
      supabase.rpc('rpc_log_voice_event', {
        p_round_id: currentRound.id,
        p_event_key: 'door_pair',
        p_text: t,
        p_locale: typeof navigator !== 'undefined' ? navigator.language || 'zh-CN' : 'zh-CN',
      }).then(
        () => void 0,
        () => void 0
      );
    }
  }, [currentRound?.id, isBanker, revealedPositions, roundHandsPublic]);

  const onRollDice = async () => {
    try {
      playSfx('dice');
      await rollDiceAction();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '掷骰子失败';
      alert(message);
    }
  };
  
  const getPlayerByPos = (pos: Position) => {
    return players.find(p => p.position === pos);
  };

  const renderPlayerArea = (pos: Position, label: string) => {
    const player = getPlayerByPos(pos);
    const result = results[pos];
    const isCurrent = currentPlayer?.position === pos;
    const latestSettlement = settlements[settlements.length - 1];
    const delta = latestSettlement?.deltas[pos] ?? 0;
    const balance = latestSettlement?.balances[pos] ?? balances[pos];

    const doorBet = pos === 'chumen' || pos === 'zhongmen' || pos === 'momen' ? betDisplay.perDoor[pos] : null;

    const isSeatRevealed = revealedPositions.has(pos);
    const publicRow = roundHandsPublic[pos];
    const publicCards = publicRow?.is_revealed && Array.isArray(publicRow.public_hand)
      ? (publicRow.public_hand as unknown as Card[])
      : [];
    const privateCards = isCurrent && myHandOpened && myRoundHand?.position === pos
      ? decodeHandCards(myRoundHand.encrypted_hand)
      : [];
    const displayCards =
      publicCards.length > 0
        ? publicCards
        : privateCards.length > 0 && currentRound?.phase !== 'settled'
          ? privateCards
          : (result?.cards ?? []);
    const displayResult = displayCards.length > 0 ? { position: pos, cards: displayCards, ...calculatePoints(displayCards) } : result;
    const canSeeThisSeat = isSeatRevealed || publicCards.length > 0 || privateCards.length > 0;
    const canRevealSingle =
      isBanker &&
      !!currentRound &&
      (currentRound.phase === 'wait_reveal' || currentRound.phase === 'revealing') &&
      !publicRow?.is_revealed &&
      !batchRevealMode;
    const canSelectBatch =
      isBanker &&
      !!currentRound &&
      (currentRound.phase === 'wait_reveal' || currentRound.phase === 'revealing') &&
      batchRevealMode &&
      pos !== 'banker' &&
      !publicRow?.is_revealed;

    const canSelfOpen =
      isCurrent &&
      !!currentRound &&
      (currentRound.phase === 'wait_reveal' || currentRound.phase === 'revealing') &&
      !publicRow?.is_revealed;

    const canSelfReveal = canSelfOpen;

    const sealed =
      !!currentRound &&
      currentRound.phase === 'betting' &&
      (pos === 'chumen'
        ? currentRound.bet_done_chumen
        : pos === 'zhongmen'
          ? currentRound.bet_done_zhongmen
          : pos === 'momen'
            ? currentRound.bet_done_momen
            : false);

    const betPeopleText = (items: { bettorName: string; amount: number; betType: string }[]) => {
      const sliced = items.slice(0, 3);
      const head = sliced.map(x => `${x.bettorName}${x.amount}`).join(' ');
      const tail = items.length > 3 ? ` +${items.length - 3}` : '';
      return `${head}${tail}`.trim();
    };

    const betTypeLabel = (t: string) => {
      if (t === 'touzi') return '头子';
      if (t === 'liangdao') return '两道';
      if (t === 'sandao') return '三道';
      if (t === 'duizi') return '对子道';
      if (t === 'cha') return '叉注';
      if (t === 'hong') return '赌红';
      return t;
    };

    return (
      <div
        onClick={async () => {
          if (canSelectBatch) {
            setBatchSelections(prev => {
              const exists = prev.includes(pos);
              if (exists) return prev.filter(x => x !== pos);
              if (prev.length >= 3) return prev;
              return [...prev, pos];
            });
            return;
          }
          if (isCurrent && (roundPhase === 'wait_reveal' || roundPhase === 'revealing') && !publicRow?.is_revealed) {
            return;
          }
          if (!canRevealSingle) return;
          try {
            if (pos === 'banker') {
              await revealSelfFlow();
            } else {
              await revealSingleFlow(pos);
            }
          } catch (e) {
            alert(e instanceof Error ? e.message : '开牌失败');
          }
        }}
        className={`flex flex-col items-center gap-2 p-4 rounded-xl transition ${
        pos === 'banker' ? 'mt-2' : ''
      } ${
        batchSelections.includes(pos) ? 'ring-2 ring-cyan-400 bg-cyan-500/10' : isCurrent ? 'bg-white/10 ring-2 ring-yellow-500 shadow-xl' : 'bg-black/20'
      } ${canSelectBatch || canRevealSingle ? 'cursor-pointer hover:bg-white/10' : ''}`}>
        <div className="text-white font-bold flex flex-col items-center">
          <div className="flex items-center gap-2">
            {label} 
            {pos === 'banker' && <span className="px-1.5 py-0.5 bg-red-600 text-[10px] rounded text-white">庄</span>}
          </div>
          <div className="text-[10px] text-gray-400 font-normal">
            {player?.name ? player.name : '(等待中...)'}
            {player?.name?.includes('电脑') && <span className="ml-1 text-blue-400">[AI]</span>}
            {player && !currentRound && (
              <span
                className={`ml-2 px-1.5 py-0.5 rounded border text-[9px] ${
                  player.is_ready
                    ? 'bg-green-600/20 border-green-500/30 text-green-300'
                    : 'bg-gray-700/20 border-white/10 text-gray-300'
                }`}
              >
                {player.is_ready ? '已准备' : '未准备'}
              </span>
            )}
          </div>
        </div>

        {player && bankerManageAvailable && isBanker && pos !== 'banker' && !player.is_ready && (
          <div className="flex gap-2">
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  playSfx('click');
                  await sendSystemMessage(`提醒：${player.name} 请点击准备`);
                  enqueueVoiceText('已提醒对方准备。', { priority: 1, interrupt: false, dedupeKey: `remind-${player.id}-${currentRound?.id || ''}`, cooldownMs: 2500, pitch: 1.0, rate: 1.0 });
                } catch (e) {
                  alert(e instanceof Error ? e.message : '发送失败');
                }
              }}
              className="px-2 py-1 rounded-full bg-gray-700 hover:bg-gray-600 border border-white/10 text-[10px]"
            >
              提醒
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  playSfx('click');
                  await forceReady(player.id);
                  await sendSystemMessage(`庄家已为 ${player.name} 强制准备`);
                  enqueueVoiceText('强制准备已完成。', { priority: 2, interrupt: false, dedupeKey: `force-ready-${player.id}-${currentRound?.id || ''}`, cooldownMs: 2500, pitch: 0.95, rate: 1.0 });
                } catch (e) {
                  alert(e instanceof Error ? e.message : '操作失败');
                }
              }}
              className="px-2 py-1 rounded-full bg-amber-700 hover:bg-amber-600 border border-amber-500/30 text-[10px]"
            >
              强制准备
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  playSfx('click');
                  await kickPlayer(player.id);
                  await sendSystemMessage(`${player.name} 已被庄家移出房间`);
                  enqueueVoiceText('已移出房间。', { priority: 3, interrupt: false, dedupeKey: `kick-${player.id}-${room?.id || ''}`, cooldownMs: 2500, pitch: 0.9, rate: 1.0 });
                } catch (e) {
                  alert(e instanceof Error ? e.message : '踢出失败');
                }
              }}
              className="px-2 py-1 rounded-full bg-red-700 hover:bg-red-600 border border-red-500/30 text-[10px]"
            >
              踢出
            </button>
          </div>
        )}

        {doorBet && (
          <div className="w-full bg-black/25 border border-white/10 rounded-lg px-2 py-1">
            <div className="flex items-center justify-between text-[10px] text-gray-200">
              <span>本门下注</span>
              <span className="text-yellow-400 font-bold">{doorBet.total}</span>
            </div>
            {Object.keys(doorBet.byType).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-gray-300">
                {Object.entries(doorBet.byType).map(([k, v]) => (
                  <span key={k} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5">
                    {betTypeLabel(k)}:{v}
                  </span>
                ))}
              </div>
            )}
            {doorBet.items.length > 0 && (
              <div className="mt-1 text-[9px] text-gray-300 whitespace-nowrap overflow-x-auto">
                {betPeopleText(doorBet.items.map(i => ({ bettorName: i.bettorName, amount: i.amount, betType: i.betType })))}
              </div>
            )}
          </div>
        )}

        {roundPhase === 'betting' && isCurrent && pos !== 'banker' && (
          <div className="flex flex-col items-center gap-1">
            <button
              disabled={sealed || !betStatus[pos]}
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await betDoneFlow();
                } catch (err) {
                  alert(err instanceof Error ? err.message : '买定离手失败');
                }
              }}
              className={`px-4 py-1.5 rounded-full border text-[10px] md:text-xs font-bold transition active:scale-95 ${
                sealed
                  ? 'bg-gray-900/40 border-white/10 text-white/40'
                  : !betStatus[pos]
                    ? 'bg-gray-900/40 border-white/10 text-white/40'
                    : 'bg-emerald-700 hover:bg-emerald-600 border-emerald-400/30 text-white'
              }`}
            >
              {sealed ? '已买定' : '买定离手'}
            </button>
            {!sealed && !betStatus[pos] && (
              <div className="text-[10px] text-white/50">请先下注本门一次</div>
            )}
          </div>
        )}
        
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-2">
            {displayCards.length > 0
              ? displayCards.map((card, idx) => (
                  <MahjongTile key={idx} value={card.value} revealed={canSeeThisSeat} />
                ))
              : [0, 1].map((idx) => {
                  const dealt = (dealCounts[pos] || 0) > idx;
                  return dealt ? (
                    <motion.div
                      key={`${pos}-back-${idx}`}
                      initial={{ opacity: 0, y: -10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.18 }}
                      className="w-12 h-16 rounded-lg border border-white/15 bg-gradient-to-b from-slate-700/60 to-slate-900/60 flex items-center justify-center"
                    >
                      <div className="w-9 h-12 rounded-md border border-white/10 bg-black/20" />
                    </motion.div>
                  ) : (
                    <div
                      key={`${pos}-ph-${idx}`}
                      className="w-12 h-16 bg-white/5 rounded-lg border-2 border-dashed border-white/10 flex items-center justify-center text-white/10"
                    >
                      ?
                    </div>
                  );
                })}
          </div>

          {(roundPhase === 'wait_reveal' || roundPhase === 'revealing') && isCurrent && !publicRow?.is_revealed && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-3">
                <button
                  disabled={!canSelfOpen || myHandActionLoading !== null}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setMyHandActionError(null);
                    try {
                      setMyHandActionLoading('open');
                      setMyHandOpened(true);
                    } finally {
                      setMyHandActionLoading(null);
                    }
                  }}
                  className={`px-5 py-2 rounded-full border text-xs font-bold transition active:scale-95 ${
                    canSelfOpen && myHandActionLoading === null
                      ? 'bg-gray-800 hover:bg-gray-700 border-white/15 text-white'
                      : 'bg-gray-900/40 border-white/10 text-white/40'
                  }`}
                >
                  {myHandActionLoading === 'open' ? '开牌中…' : '开牌'}
                </button>
                <button
                  disabled={!canSelfReveal || myHandActionLoading !== null}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setMyHandActionError(null);
                    try {
                      setMyHandActionLoading('reveal');
                      await revealMineFlow();
                    } catch (err) {
                      setMyHandActionError(err instanceof Error ? err.message : '亮牌失败');
                    } finally {
                      setMyHandActionLoading(null);
                    }
                  }}
                  className={`px-5 py-2 rounded-full border text-xs font-bold transition active:scale-95 ${
                    canSelfReveal && myHandActionLoading === null
                      ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-400/30 text-white'
                      : 'bg-emerald-900/20 border-emerald-500/10 text-white/40'
                  }`}
                >
                  {myHandActionLoading === 'reveal' ? '亮牌中…' : '亮牌'}
                </button>
              </div>

              {!myRoundHand?.position || myRoundHand.position !== pos ? (
                <div className="text-[10px] text-white/50 text-center">
                  等待同步你的手牌…
                </div>
              ) : null}

              {myHandActionError && (
                <div className="text-[10px] text-red-200 text-center bg-red-900/20 border border-red-500/20 rounded-lg px-2 py-1">
                  {myHandActionError}
                </div>
              )}

              {myHandActionError && myHandActionError.includes('migrate:apply') && (
                <div className="text-[10px] text-white/50 text-center">
                  当前 Supabase：{SUPABASE_URL}
                </div>
              )}
            </div>
          )}
        </div>

        {displayResult && canSeeThisSeat && (
          <div className="flex flex-col items-center gap-1">
            <div className="text-yellow-400 font-bold text-lg">
              {displayResult.isPair ? `对${displayResult.points}筒` : `${displayResult.points}点`}
            </div>
            {pos !== 'banker' && revealedPositions.has('banker') && results.banker && (
              <div className={`text-[10px] font-bold ${compareResults(displayResult, results.banker) ? 'text-green-400' : 'text-red-400'}`}>
                {compareResults(displayResult, results.banker) ? '赢庄' : '输庄'}
              </div>
            )}
            {currentRound?.phase === 'settled' && (
              <>
                <div className={`text-[10px] font-black ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {delta >= 0 ? `本轮 +${delta}` : `本轮 ${delta}`}
                </div>
                <div className="text-[10px] text-gray-300">余额 {balance >= 0 ? `+${balance}` : balance}</div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const latestSettlement = settlements[settlements.length - 1];
  const roundPhase = currentRound?.phase || null;
  const showDiceArea =
    !currentRound ||
    roundPhase === 'betting' ||
    roundPhase === 'dice_done';
  const phaseLabel = (() => {
    if (!roundPhase) return '';
    if (roundPhase === 'betting') return '等待庄家掷骰';
    if (roundPhase === 'dice_done') return '等待庄家发牌';
    if (roundPhase === 'dealing') return '正在发牌';
    if (roundPhase === 'wait_reveal') return '等待玩家开牌/亮牌';
    if (roundPhase === 'revealing') return '亮牌中';
    if (roundPhase === 'settling') return '正在结算';
    if (roundPhase === 'settled') return '本轮已结算';
    return roundPhase;
  })();

  const humorRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!latestSettlement) return;
    if (!allRevealed) return;
    if (!currentPlayer?.position) return;
    const pos = currentPlayer.position;
    if (pos !== 'banker' && pos !== 'chumen' && pos !== 'zhongmen' && pos !== 'momen') return;
    if (humorRoundRef.current === latestSettlement.roundNumber) return;
    humorRoundRef.current = latestSettlement.roundNumber;

    const delta = latestSettlement.deltas[pos] ?? 0;
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    const loseLines = ['再接再厉，加油哦。', '好牌一定会来的。', '稳住，下一把翻盘！', '别急，牌运马上来。'];
    const winLines = ['漂亮！继续保持。', '手气不错哦。', '稳住，再来一把。', '状态很好，继续冲！'];

    if (delta < 0) {
      enqueueVoiceText(pick(loseLines), { priority: 6, interrupt: true, dedupeKey: `lose-${latestSettlement.roundNumber}-${pos}`, cooldownMs: 15_000, pitch: 0.98, rate: 1.0 });
    } else if (delta > 0) {
      enqueueVoiceText(pick(winLines), { priority: 6, interrupt: true, dedupeKey: `win-${latestSettlement.roundNumber}-${pos}`, cooldownMs: 15_000, pitch: 1.02, rate: 1.02 });
    }

    if (!isBanker || !currentRound?.id) return;
    const state = publicVoiceRoundRef.current;
    if (!state || state.roundId !== currentRound.id) return;

    const allWin = latestSettlement.compareLoseCount === 0;
    const allLose = latestSettlement.compareLoseCount === 3;
    if (allWin && !state.keys.has('banker_all_win')) {
      state.keys.add('banker_all_win');
      const lines = ['庄家旺，大杀四方！', '漂亮的通杀，气势起来了！', '庄家亮堂，赢到天亮！'];
      const t = pick(lines);
      supabase.rpc('rpc_log_voice_event', {
        p_round_id: currentRound.id,
        p_event_key: 'banker_all_win',
        p_text: t,
        p_locale: typeof navigator !== 'undefined' ? navigator.language || 'zh-CN' : 'zh-CN',
      }).then(
        () => void 0,
        () => void 0
      );
    } else if (allLose && !state.keys.has('banker_all_lose')) {
      state.keys.add('banker_all_lose');
      const lines = ['快来下注呀！', '押得多，回家买辆小汽车！', '庄家发红包啦！'];
      const t = pick(lines);
      supabase.rpc('rpc_log_voice_event', {
        p_round_id: currentRound.id,
        p_event_key: 'banker_all_lose',
        p_text: t,
        p_locale: typeof navigator !== 'undefined' ? navigator.language || 'zh-CN' : 'zh-CN',
      }).then(
        () => void 0,
        () => void 0
      );
    }
  }, [latestSettlement, allRevealed, currentPlayer?.position, enqueueVoiceText, isBanker, currentRound?.id]);

  const posLabel = (pos: Position) => {
    if (pos === 'banker') return '庄家';
    if (pos === 'chumen') return '出门';
    if (pos === 'zhongmen') return '中门';
    return '末门';
  };

  const betTypeLabel = (t: string) => {
    if (t === 'touzi') return '头子';
    if (t === 'liangdao') return '两道';
    if (t === 'sandao') return '三道';
    if (t === 'duizi') return '对子道';
    if (t === 'cha') return '叉注';
    if (t === 'hong') return '赌红';
    return t;
  };

  const crossLabel = (doors?: Array<'chumen' | 'zhongmen' | 'momen'>) => {
    if (!doors || doors.length !== 2) return '叉注';
    const set = new Set(doors);
    if (set.has('chumen') && set.has('zhongmen')) return '出中叉';
    if (set.has('zhongmen') && set.has('momen')) return '中末叉';
    if (set.has('momen') && set.has('chumen')) return '末出叉';
    return '叉注';
  };

  const betTargetText = (b: BetDetail) => {
    if (b.betType === 'cha') return crossLabel(b.crossPositions);
    if (b.betType === 'hong') return '赌红';
    return posLabel(b.position);
  };
  const toOutcomePhrase = (s: { compareLoseCount?: number; compareWinCount?: number; outcomeLabel: string }) => {
    const lose = typeof s.compareLoseCount === 'number' ? s.compareLoseCount : null;
    const win = typeof s.compareWinCount === 'number' ? s.compareWinCount : null;
    if (lose === 3) return '赔3';
    if (lose === 2) return '赢1赔2';
    if (lose === 1) return '赢2赔1';
    if (lose === 0) return '赢3';
    if (win === 3) return '赢3';
    if (s.outcomeLabel === '赔3') return '赔3';
    if (s.outcomeLabel === '赢3') return '赢3';
    return s.outcomeLabel;
  };

  const outcomeLine = revealHistory.map(r => `${r.index}.${r.phrase}`).join('  ');
  const outcomeCounts = settlements.reduce<Record<string, number>>((acc, s) => {
    acc[s.outcomeLabel] = (acc[s.outcomeLabel] || 0) + 1;
    return acc;
  }, {});

  const crossLabelText = (key: 'CZ' | 'ZM' | 'MC') => {
    const group = betDisplay.cross[key];
    if (!group || group.items.length === 0) return null;
    const head = group.items.slice(0, 3).map(i => `${i.bettorName}${i.amount}`).join(' ');
    const tail = group.items.length > 3 ? ` +${group.items.length - 3}` : '';
    return `${group.label} ${group.total}｜${head}${tail}`;
  };

  return (
    <div className="space-y-3">
      {remainingCounts && (
        <div className="bg-gray-900/60 border border-white/10 rounded-2xl px-4 py-2 text-[10px] md:text-xs text-gray-200 whitespace-nowrap overflow-x-auto">
          <span className="text-gray-400 font-bold mr-2">剩余牌</span>
          <span className="text-gray-400 mr-3">(剩{remainingCounts.totalRemaining}/总{remainingCounts.totalDeck})</span>
          {(Array.from({ length: 9 }, (_, i) => i + 1) as number[])
            .map(v => `${v}筒${remainingCounts.remainingByValue[v]}`)
            .join('  ')}
        </div>
      )}
      <div
        className="relative w-full aspect-square md:aspect-auto md:h-[600px] bg-green-900 rounded-3xl md:rounded-[100px] border-8 md:border-[12px] border-amber-900 shadow-2xl overflow-hidden scale-[0.95] sm:scale-100 p-4 md:p-8"
      >
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {crossLabelText('CZ') && (
        <div className="absolute top-[26%] right-[18%] max-w-[42%] bg-black/40 border border-white/10 rounded-full px-3 py-1 text-[10px] text-gray-100 whitespace-nowrap overflow-hidden text-ellipsis">
          {crossLabelText('CZ')}
        </div>
      )}
      {crossLabelText('ZM') && (
        <div className="absolute top-[26%] left-[18%] max-w-[42%] bg-black/40 border border-white/10 rounded-full px-3 py-1 text-[10px] text-gray-100 whitespace-nowrap overflow-hidden text-ellipsis">
          {crossLabelText('ZM')}
        </div>
      )}
      {crossLabelText('MC') && (
        <div className="absolute bottom-[24%] left-1/2 -translate-x-1/2 max-w-[60%] bg-black/40 border border-white/10 rounded-full px-3 py-1 text-[10px] text-gray-100 whitespace-nowrap overflow-hidden text-ellipsis">
          {crossLabelText('MC')}
        </div>
      )}

      {/* Seats (absolute positioning keeps layout stable after betting UI expands) */}
      <div className="absolute top-6 md:top-10 left-1/2 -translate-x-1/2 scale-75 md:scale-100 origin-top max-w-[280px] md:max-w-none">
        {renderPlayerArea('zhongmen', '中门')}
      </div>

      <div className="absolute left-4 md:left-10 top-1/2 -translate-y-1/2 scale-75 md:scale-100 origin-left max-w-[280px] md:max-w-none">
        {renderPlayerArea('momen', '末门')}
      </div>

      <div className="absolute right-4 md:right-10 top-1/2 -translate-y-1/2 scale-75 md:scale-100 origin-right max-w-[280px] md:max-w-none">
        {renderPlayerArea('chumen', '出门')}
      </div>

      <div className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 scale-75 md:scale-100 origin-bottom max-w-[300px] md:max-w-none">
        {renderPlayerArea('banker', '庄家')}
      </div>

      {showDiceArea && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 md:gap-4 bg-black/30 p-3 md:p-6 rounded-3xl md:rounded-full border-2 md:border-4 border-amber-800 shadow-inner z-10 scale-90 md:scale-100">
          <div className="flex gap-2 md:gap-4">
            <div className="scale-75 md:scale-100"><Dice value={dice[0]} isRolling={isRolling} /></div>
            <div className="scale-75 md:scale-100"><Dice value={dice[1]} isRolling={isRolling} /></div>
          </div>

          {startPosLabel && !isRolling && (
            <div className="text-white font-bold text-[10px] md:text-sm bg-black/50 px-2 md:px-3 py-1 rounded-full border border-white/10 whitespace-nowrap">
              总计 <span className="text-yellow-400">{diceTotal}</span> ｜ 从 <span className="text-yellow-400">{startPosLabel}</span> 开始发牌
            </div>
          )}

          <div className="flex flex-col gap-1 md:gap-2 min-w-[80px] md:min-w-[120px]">
            {!currentRound && currentPlayer && !currentPlayer.is_ready && (
              <button
                onClick={async () => {
                  try {
                    await setReady();
                  } catch (e) {
                    alert(e instanceof Error ? e.message : '准备失败');
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs md:text-base font-bold py-1.5 md:py-2 px-4 md:px-6 rounded-full shadow-lg transition transform active:scale-95"
              >
                准备
              </button>
            )}

            {!currentRound && currentPlayer && currentPlayer.is_ready && (
              <button
                onClick={async () => {
                  try {
                    await cancelReady();
                  } catch (e) {
                    alert(e instanceof Error ? e.message : '取消失败');
                  }
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xs md:text-base font-bold py-1.5 md:py-2 px-4 md:px-6 rounded-full shadow-lg transition transform active:scale-95 border border-white/10"
              >
                取消准备
              </button>
            )}

            {!currentRound && isBanker && (
              <>
                <button
                  onClick={async () => {
                    try {
                      await forceReadyAll();
                    } catch (e) {
                      alert(e instanceof Error ? e.message : '操作失败');
                    }
                  }}
                  className="text-white text-[10px] md:text-xs font-bold py-1.5 md:py-2 px-3 md:px-4 rounded-full shadow-lg transition transform active:scale-95 mb-1 border bg-emerald-700 hover:bg-emerald-600 border-emerald-500/30"
                >
                  一键全部准备
                </button>

                <button
                  onClick={async () => {
                    try {
                      playSfx('click');
                      await createRoomInvite();
                      enqueueVoiceText('邀请已发出，等他来！', { priority: 2, interrupt: false, dedupeKey: `invite-send-${room?.id || ''}`, cooldownMs: 2500, pitch: 1.05, rate: 1.0 });
                      alert('已发送房间邀请');
                    } catch (e) {
                      alert(e instanceof Error ? e.message : '发送失败');
                    }
                  }}
                  className="text-white text-[10px] md:text-xs font-bold py-1.5 md:py-2 px-3 md:px-4 rounded-full shadow-lg transition transform active:scale-95 mb-1 border bg-gray-700 hover:bg-gray-600 border-white/10"
                >
                  邀请玩家
                </button>

                <button
                  onClick={async () => {
                    try {
                      await setRoomAIEnabled(!room?.ai_enabled);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : '设置失败');
                    }
                  }}
                  className={`text-white text-[10px] md:text-xs font-bold py-1.5 md:py-2 px-3 md:px-4 rounded-full shadow-lg transition transform active:scale-95 mb-1 border ${
                    room?.ai_enabled
                      ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400'
                      : 'bg-gray-700 hover:bg-gray-600 border-gray-600'
                  }`}
                >
                  {room?.ai_enabled ? '已启用AI兜底' : '启用AI兜底'}
                </button>
                {players.length < 4 && (
                  <button onClick={addAIPlayers} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] md:text-xs font-bold py-1.5 md:py-2 px-3 md:px-4 rounded-full shadow-lg transition transform active:scale-95 mb-1">
                    添加AI
                  </button>
                )}
                <button
                  onClick={async () => {
                    try {
                      playSfx('click');
                      await startGame();
                      enqueueVoiceText('各位观众，好戏开场啦！', { priority: 8, interrupt: true, dedupeKey: `start-${room?.id || ''}-${currentRound?.id || ''}`, cooldownMs: 20_000, pitch: 0.95, rate: 1.0 });
                    } catch (e) {
                      alert(e instanceof Error ? e.message : '开始失败');
                    }
                  }}
                  disabled={players.length < 4 || !allReady}
                  className="bg-red-600 hover:bg-red-500 text-white text-xs md:text-base font-bold py-1.5 md:py-2 px-4 md:px-6 rounded-full shadow-lg transition transform active:scale-95 disabled:opacity-50"
                >
                  开始
                </button>

                <button
                  onClick={async () => {
                    if (!confirm('确认解散房间并退出？')) return;
                    try {
                      await dissolveRoom();
                    } catch (e) {
                      alert(e instanceof Error ? e.message : '解散失败');
                    }
                  }}
                  className="bg-gray-800 hover:bg-gray-700 text-white text-[10px] md:text-xs font-bold py-1.5 md:py-2 px-3 md:px-4 rounded-full shadow-lg transition transform active:scale-95 border border-white/10"
                >
                  解散并退出
                </button>

                {players.length >= 4 && !allReady && (
                  <div className="text-[10px] text-gray-200 text-center bg-black/30 border border-white/10 rounded-lg px-2 py-1">
                    等待所有玩家准备后才能开始
                  </div>
                )}
              </>
            )}

            {currentRound && isBanker && currentRound.phase === 'betting' && !startPos && (
              <div className="flex flex-wrap justify-center gap-2">
                {!allBetsSealed && (
                  <button
                    onClick={async () => {
                      try {
                        await betCloseFlow();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : '结束下注失败');
                      }
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-white text-xs md:text-base font-bold py-1.5 md:py-2 px-4 md:px-6 rounded-full shadow-lg transition transform active:scale-95 border border-white/10"
                  >
                    结束下注
                  </button>
                )}

                <button
                  onClick={onRollDice}
                  disabled={isRolling || !allBetsDone || !allBetsSealed}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs md:text-base font-bold py-1.5 md:py-2 px-4 md:px-6 rounded-full shadow-lg transition transform active:scale-95 disabled:opacity-50"
                >
                  掷骰子
                </button>
              </div>
            )}

            {currentRound && isBanker && currentRound.phase === 'betting' && !startPos && !allBetsDone && (
              <div className="text-[10px] text-gray-200 text-center bg-black/30 border border-white/10 rounded-lg px-2 py-1">
                等待闲家下注完成后才能掷骰
              </div>
            )}

            {currentRound && isBanker && currentRound.phase === 'betting' && !startPos && allBetsDone && !allBetsSealed && (
              <div className="text-[10px] text-gray-200 text-center bg-black/30 border border-white/10 rounded-lg px-2 py-1">
                等待闲家买定离手后才能掷骰，或由庄家结束下注
              </div>
            )}

            {currentRound && currentRound.phase === 'dice_done' && (
              <>
                {isBanker ? (
                  <button
                    onClick={async () => {
                      try {
                        playSfx('whoosh', { volume: 0.8, playbackRate: 1.0 });
                        await startDealFlow();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : '发牌失败');
                      }
                    }}
                    className="bg-green-600 hover:bg-green-500 text-white text-xs md:text-base font-bold py-1.5 md:py-2 px-4 md:px-6 rounded-full shadow-lg transition transform active:scale-95"
                  >
                    发牌
                  </button>
                ) : (
                  <div className="text-[10px] text-gray-200 text-center bg-black/30 border border-white/10 rounded-lg px-2 py-1">
                    等待庄家发牌
                  </div>
                )}
              </>
            )}

            {currentRound && currentRound.phase === 'dealing' && (
              <>
                <div className="text-[10px] text-gray-200 text-center bg-black/30 border border-white/10 rounded-lg px-2 py-1">
                  正在按逆时针发牌...
                </div>
                {dealingFinishError && (
                  <div className="text-[10px] text-red-200 text-center bg-red-900/20 border border-red-500/20 rounded-lg px-2 py-1">
                    {dealingFinishError}
                  </div>
                )}
                {isBanker && (
                  <button
                    onClick={async () => {
                      try {
                        await finishDealFlow();
                        setDealingFinishError(null);
                      } catch (e) {
                        setDealingFinishError(e instanceof Error ? e.message : '结束发牌失败');
                      }
                    }}
                    className="bg-amber-600 hover:bg-amber-500 text-white text-xs md:text-base font-bold py-1.5 md:py-2 px-4 md:px-6 rounded-full shadow-lg transition transform active:scale-95"
                  >
                    结束发牌
                  </button>
                )}
              </>
            )}

            {currentRound && (currentRound.phase === 'wait_reveal' || currentRound.phase === 'revealing') && (
              <>
                {isBanker ? (
                  <>
                    {!batchRevealMode && (
                      <div className="flex flex-wrap justify-center gap-2">
                        {([
                          { pos: 'chumen' as const, label: '开出门' },
                          { pos: 'zhongmen' as const, label: '开中门' },
                          { pos: 'momen' as const, label: '开末门' },
                        ]).map(({ pos, label }) => {
                          const publicRow = roundHandsPublic[pos];
                          if (publicRow?.is_revealed) return null;
                          return (
                            <button
                              key={pos}
                              onClick={async () => {
                                try {
                                  await revealSingleFlow(pos);
                                } catch (e) {
                                  alert(e instanceof Error ? e.message : '开牌失败');
                                }
                              }}
                              className="bg-gray-700 hover:bg-gray-600 text-white text-[10px] md:text-xs font-bold py-1.5 md:py-2 px-3 md:px-4 rounded-full shadow-lg transition border border-white/10"
                            >
                              {label}
                            </button>
                          );
                        })}
                        {(() => {
                          const unrevealed = (['chumen', 'zhongmen', 'momen'] as const).filter(p => !roundHandsPublic[p]?.is_revealed);
                          if (unrevealed.length !== 3) return null;
                          return (
                            <button
                              onClick={async () => {
                                try {
                                  await revealBatchFlow(['chumen', 'zhongmen', 'momen']);
                                } catch (e) {
                                  alert(e instanceof Error ? e.message : '批量开牌失败');
                                }
                              }}
                              className="bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] md:text-xs font-bold py-1.5 md:py-2 px-3 md:px-4 rounded-full shadow-lg transition border border-cyan-400/30"
                            >
                              一键开三门
                            </button>
                          );
                        })()}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setBatchRevealMode(v => !v);
                        setBatchSelections([]);
                      }}
                      className={`text-white text-[10px] md:text-xs font-bold py-1.5 md:py-2 px-3 md:px-4 rounded-full shadow-lg transition border ${
                        batchRevealMode
                          ? 'bg-cyan-600 hover:bg-cyan-500 border-cyan-400'
                          : 'bg-gray-700 hover:bg-gray-600 border-white/10'
                      }`}
                    >
                      {batchRevealMode ? '退出批量开牌' : '批量开牌'}
                    </button>

                    {batchRevealMode ? (
                      <>
                        <div className="text-[10px] text-gray-200 text-center bg-black/30 border border-white/10 rounded-lg px-2 py-1">
                          请选择三家闲家后确认批量开牌
                        </div>
                        <button
                          disabled={batchSelections.length !== 3}
                          onClick={async () => {
                            try {
                              await revealBatchFlow(batchSelections.filter((p): p is Exclude<Position, 'banker'> => p !== 'banker'));
                              setBatchSelections([]);
                              setBatchRevealMode(false);
                            } catch (e) {
                              alert(e instanceof Error ? e.message : '批量开牌失败');
                            }
                          }}
                          className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs md:text-base font-bold py-1.5 md:py-2 px-4 md:px-6 rounded-full shadow-lg transition transform active:scale-95 disabled:opacity-50"
                        >
                          确认开这三家
                        </button>
                      </>
                    ) : (
                      <div className="text-[10px] text-gray-200 text-center bg-black/30 border border-white/10 rounded-lg px-2 py-1">
                        点击任意未亮牌玩家即可逐家开牌
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[10px] text-gray-200 text-center bg-black/30 border border-white/10 rounded-lg px-2 py-1">
                    等待庄家开牌
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      )}

      {showDiceArea && isRevealing && !allRevealed && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="bg-black/40 border border-white/10 rounded-full px-3 py-1 text-[10px] text-gray-100 whitespace-nowrap">
            {currentRound?.phase === 'dealing' ? '正在发牌...' : '庄家正在开牌...'}
          </div>
        </div>
      )}

      {/* Round Info Overlay */}
      <div className="absolute top-4 left-4 md:top-8 md:left-8 bg-black/50 p-2 md:p-3 rounded-lg border border-white/20 text-white text-[8px] md:text-xs">
        <div className="flex items-center gap-1 md:gap-2 mb-1">
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse" />
          房间: <span className="text-yellow-400 font-bold">{room?.join_code}</span>
        </div>
        <div>{roundNum > 0 ? `第 ${roundNum} 轮` : '未开局'} | {seatedCount}/4人</div>
        {currentRound && (
          <div className="mt-1 text-[8px] md:text-xs text-gray-200">
            阶段: <span className="text-yellow-400 font-bold">{phaseLabel}</span>
            {currentRound.phase === 'betting' && (
              <span className="ml-2">
                下注: 出{betStatus.chumen ? '✅' : '⏳'} 中{betStatus.zhongmen ? '✅' : '⏳'} 末{betStatus.momen ? '✅' : '⏳'}
              </span>
            )}
            {startPos && currentRound.phase !== 'settled' && <span className="ml-2 text-yellow-400 font-bold">已封盘</span>}
          </div>
        )}
      </div>
      </div>

      {latestSettlement && results.banker && allRevealed && (
        <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-3 md:p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-gold-500">第 {latestSettlement.roundNumber} 轮结果</div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-300">庄家走势：<span className="text-yellow-400 font-bold">{latestSettlement.outcomeLabel}</span></div>
              {isBanker && (
                <div className="flex items-center gap-2">
                  {roundNum < 3 && (
                    <button
                      onClick={async () => {
                        playSfx('click');
                        enqueueVoiceText('下轮继续！', { priority: 2, interrupt: false, dedupeKey: `next-${room?.id || ''}-${roundNum}`, cooldownMs: 2500, pitch: 1.0, rate: 1.0 });
                        try {
                          await finishRound(true);
                          await refreshRound();
                        } catch (e) {
                          alert(e instanceof Error ? e.message : '下轮失败');
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-3 rounded-full shadow-lg transition text-[10px]"
                    >
                      下轮
                    </button>
                  )}
                  {roundNum === 3 && (
                    <>
                      <button
                        onClick={async () => {
                          playSfx('click');
                          enqueueVoiceText('发第4轮。', { priority: 2, interrupt: false, dedupeKey: `next4-${room?.id || ''}`, cooldownMs: 2500, pitch: 1.0, rate: 1.0 });
                          try {
                            await finishRound(true);
                            await refreshRound();
                          } catch (e) {
                            alert(e instanceof Error ? e.message : '发第4轮失败');
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-3 rounded-full shadow-lg transition text-[10px]"
                      >
                        发第4轮
                      </button>
                      <button
                        onClick={async () => {
                          playSfx('click');
                          enqueueVoiceText('结束本局，重洗开新局。', { priority: 3, interrupt: true, dedupeKey: `reset-${room?.id || ''}`, cooldownMs: 2500, pitch: 0.95, rate: 1.0 });
                          try {
                            await finishRound(false);
                            await refreshRound();
                          } catch (e) {
                            alert(e instanceof Error ? e.message : '结束本局失败');
                          }
                        }}
                        className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded-full shadow-lg transition text-[10px]"
                      >
                        结束本局·重洗
                      </button>
                    </>
                  )}
                  {roundNum === 4 && (
                    <>
                      <button
                        onClick={async () => {
                          playSfx('click');
                          enqueueVoiceText('发最后四张！', { priority: 3, interrupt: false, dedupeKey: `last4-${room?.id || ''}`, cooldownMs: 2500, pitch: 1.05, rate: 1.05 });
                          try {
                            await finishRound(true);
                            await refreshRound();
                          } catch (e) {
                            alert(e instanceof Error ? e.message : '发最后四张失败');
                          }
                        }}
                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-1 px-3 rounded-full shadow-lg transition text-[10px]"
                      >
                        发最后四张
                      </button>
                      <button
                        onClick={async () => {
                          playSfx('click');
                          enqueueVoiceText('结束本局，重洗开新局。', { priority: 3, interrupt: true, dedupeKey: `reset-${room?.id || ''}`, cooldownMs: 2500, pitch: 0.95, rate: 1.0 });
                          try {
                            await finishRound(false);
                            await refreshRound();
                          } catch (e) {
                            alert(e instanceof Error ? e.message : '结束本局失败');
                          }
                        }}
                        className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded-full shadow-lg transition text-[10px]"
                      >
                        结束本局·重洗
                      </button>
                    </>
                  )}
                  {roundNum >= 5 && (
                    <button
                      onClick={async () => {
                        playSfx('click');
                        enqueueVoiceText('结束，重洗开新局。', { priority: 3, interrupt: true, dedupeKey: `reset-${room?.id || ''}`, cooldownMs: 2500, pitch: 0.95, rate: 1.0 });
                        try {
                          await finishRound(false);
                          await refreshRound();
                        } catch (e) {
                          alert(e instanceof Error ? e.message : '结束本局失败');
                        }
                      }}
                      className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded-full shadow-lg transition text-[10px]"
                    >
                      结束·重洗
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {(['banker', 'chumen', 'zhongmen', 'momen'] as const).map(pos => (
              <div key={pos} className="bg-black/30 rounded-xl p-2 border border-white/5">
                <div className="text-[10px] text-gray-400">{pos === 'banker' ? '庄家' : pos === 'chumen' ? '出门' : pos === 'zhongmen' ? '中门' : '末门'}</div>
                <div className={`font-black ${latestSettlement.deltas[pos] >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {latestSettlement.deltas[pos] >= 0 ? `+${latestSettlement.deltas[pos]}` : latestSettlement.deltas[pos]}
                </div>
                <div className="text-[10px] text-gray-300">余额 {latestSettlement.balances[pos] >= 0 ? `+${latestSettlement.balances[pos]}` : latestSettlement.balances[pos]}</div>

                <div className="mt-2 text-[10px] text-gray-400">下注明细</div>
                {latestSettlement.betDetailsByPosition?.[pos]?.length ? (
                  <div className="mt-1 space-y-1 max-h-[86px] overflow-y-auto pr-1">
                    {latestSettlement.betDetailsByPosition[pos].map((b, idx) => {
                      const pl = b.profitLoss;
                      const plText = pl > 0 ? `+${pl}` : String(pl);
                      const plClass = pl > 0 ? 'text-green-400' : pl < 0 ? 'text-red-400' : 'text-gray-300';
                      return (
                        <div key={`${b.betId}_${idx}`} className="flex items-center justify-between gap-2 text-[10px]">
                          <div className="text-gray-200 truncate">
                            {betTypeLabel(b.betType)} {betTargetText(b)} {b.amount}
                          </div>
                          <div className={`font-bold shrink-0 ${plClass}`}>{plText}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-gray-300">无</div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-gray-300">
            <span className="text-gray-400">庄家走势统计:</span>
            {Object.entries(outcomeCounts).map(([k, v]) => (
              <span key={k} className="px-2 py-1 rounded-full bg-black/30 border border-white/5">
                {k} × {v}
              </span>
            ))}
          </div>

          {revealHistory.length > 0 && (
            <div className="mt-3 bg-black/30 border border-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[10px] text-gray-400">开牌记录（连续，跨局不清空）</div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] text-gray-500">当前第 {gameNo} 局</div>
                  <button
                    onClick={clearRevealHistory}
                    className="text-[10px] px-2 py-1 rounded-full bg-gray-700 hover:bg-gray-600 border border-white/10"
                  >
                    清空记录
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-100 whitespace-nowrap overflow-x-auto pb-1">
                {outcomeLine}
              </div>
            </div>
          )}

          <div className="mt-3 text-[10px] text-gray-400">庄家走势从第1轮到当前（可横向滑动）</div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {settlements.map(s => (
              <div key={s.roundNumber} className="min-w-[160px] bg-black/30 rounded-xl p-2 border border-white/5">
                <div className="text-[10px] text-gray-400">第{s.roundNumber}轮 · <span className="text-yellow-400 font-bold">{toOutcomePhrase(s)}</span></div>
                <div className="text-[10px] text-gray-300">庄 {s.deltas.banker >= 0 ? `+${s.deltas.banker}` : s.deltas.banker} | 出 {s.deltas.chumen >= 0 ? `+${s.deltas.chumen}` : s.deltas.chumen}</div>
                <div className="text-[10px] text-gray-300">中 {s.deltas.zhongmen >= 0 ? `+${s.deltas.zhongmen}` : s.deltas.zhongmen} | 末 {s.deltas.momen >= 0 ? `+${s.deltas.momen}` : s.deltas.momen}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {room && (
        <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm md:text-base font-black text-gray-100">
              房间号：<span className="font-mono text-gold-500">{room.join_code}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(room.join_code);
                    alert('已复制房间号');
                  } catch {
                    alert('复制失败，请手动复制');
                  }
                }}
                className="text-xs font-bold px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-gray-200 hover:bg-white/5"
              >
                复制
              </button>
              {currentPlayer && currentPlayer.role !== 'banker' && (
                <button
                  onClick={async () => {
                    if (!confirm('确认退出房间？')) return;
                    try {
                      await leaveRoom();
                    } catch (e) {
                      alert(e instanceof Error ? e.message : '退出失败');
                    }
                  }}
                  className="text-xs font-bold px-3 py-2 rounded-xl bg-gray-800 border border-white/10 text-gray-200 hover:bg-gray-700"
                >
                  退出
                </button>
              )}
            </div>
          </div>

          {isBanker && (
            <div className="bg-black/30 border border-white/10 rounded-2xl p-3">
              <div className="text-xs font-black text-gray-200 mb-2">房间管理</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    try {
                      playSfx('click');
                      await createRoomInvite();
                      enqueueVoiceText('邀请已发出，等他来！', { priority: 2, interrupt: false, dedupeKey: `invite-send-${room?.id || ''}`, cooldownMs: 2500, pitch: 1.05, rate: 1.0 });
                      alert('已发送房间邀请');
                    } catch (e) {
                      alert(e instanceof Error ? e.message : '发送失败');
                    }
                  }}
                  className="text-xs font-bold px-3 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 border border-white/10"
                >
                  邀请人
                </button>

                <button
                  onClick={async () => {
                    try {
                      playSfx('click');
                      await sendSystemMessage('提醒：请所有玩家点击准备');
                      enqueueVoiceText('已提醒全员准备。', { priority: 1, interrupt: false, dedupeKey: `remind-all-${room?.id || ''}`, cooldownMs: 2500, pitch: 1.0, rate: 1.0 });
                    } catch (e) {
                      alert(e instanceof Error ? e.message : '发送失败');
                    }
                  }}
                  className="text-xs font-bold px-3 py-2 rounded-xl bg-black/30 hover:bg-white/5 border border-white/10"
                >
                  提醒准备
                </button>

                <button
                  onClick={async () => {
                    try {
                      playSfx('click');
                      await forceReadyAll();
                      enqueueVoiceText('全员已强制准备。', { priority: 2, interrupt: false, dedupeKey: `force-ready-all-${room?.id || ''}`, cooldownMs: 2500, pitch: 0.95, rate: 1.0 });
                    } catch (e) {
                      alert(e instanceof Error ? e.message : '操作失败');
                    }
                  }}
                  className="text-xs font-bold px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 border border-emerald-500/30"
                >
                  一键全部准备
                </button>

                <button
                  onClick={async () => {
                    if (!confirm('确认解散房间并退出？')) return;
                    try {
                      await dissolveRoom();
                    } catch (e) {
                      alert(e instanceof Error ? e.message : '解散失败');
                    }
                  }}
                  className="text-xs font-bold px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 border border-red-500/30"
                >
                  解散房间
                </button>
              </div>
              {currentRound && !bankerManageAvailable && (
                <div className="mt-2 text-[10px] text-gray-400">踢人仅在未开局或本轮结算后可操作</div>
              )}
            </div>
          )}

          <div className="text-xs font-bold text-gray-300">房间聊天</div>
          <div className="bg-black/30 border border-white/10 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                <Radio className={`w-4 h-4 ${voiceStatus === 'on' ? 'text-emerald-400' : 'text-gray-500'}`} />
                {voiceStatus === 'on' ? '语音开启' : voiceStatus === 'connecting' ? '语音连接中' : '语音关闭'}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={Boolean(activePenalty) && voiceStatus !== 'on'}
                  onClick={async () => {
                    try {
                      await toggleVoice();
                    } catch (e) {
                      setVoiceError(e instanceof Error ? e.message : '语音切换失败');
                    }
                  }}
                  className={`text-[10px] font-black px-3 py-2 rounded-xl border ${
                    voiceStatus === 'on'
                      ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-500/30 text-white'
                      : 'bg-gray-900/60 hover:bg-gray-900 text-gray-200 border-white/10'
                  }`}
                >
                  {voiceStatus === 'on'
                    ? '关闭语音'
                    : activePenalty
                      ? '已被禁言'
                      : '开启实时语音'}
                </button>
                <button
                  disabled={voiceStatus !== 'on'}
                  onClick={() => {
                    void toggleMute();
                  }}
                  className="text-[10px] font-black px-3 py-2 rounded-xl bg-gray-900/60 hover:bg-gray-900 text-gray-200 border border-white/10 disabled:opacity-40"
                >
                  {voiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="text-[10px] text-gray-400">
              {voiceError
                ? voiceError
                : voiceStatus === 'connecting'
                  ? '语音连接中…'
                : voiceStatus === 'on'
                  ? `当前有 ${voiceMembers.length} 位玩家加入语音`
                    : providerKind === 'livekit'
                      ? '默认关闭，仅开启者加入房间级语音通道'
                      : providerKind === 'agora'
                        ? '默认关闭，仅开启者加入 Agora 房间级语音通道'
                        : '未配置语音服务：当前仅本地麦克风测试，其他玩家听不到'}
            </div>
            {activePenalty && (
              <div className="text-[10px] text-red-300">
                禁言到期：{activePenalty.expires_at ? new Date(activePenalty.expires_at).toLocaleString() : '长期'}
              </div>
            )}
            {showVoiceDebugPanel && (
              <div className="text-[10px] text-gray-500">
                Provider: {providerKind === 'livekit' ? 'LiveKit' : providerKind === 'agora' ? 'Agora' : 'Browser Stub'}
              </div>
            )}
            <div className="space-y-2">
              <div
                className={`text-[10px] rounded-lg border px-2 py-1 flex items-start justify-between gap-2 ${
                  micPermission === 'granted'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : micPermission === 'denied'
                      ? 'bg-red-500/10 border-red-500/20 text-red-300'
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                }`}
              >
                <div>麦克风权限：{micPermissionLabel}。{micPermissionHint}</div>
                <button
                  type="button"
                  onClick={() => setVoicePermissionHelpOpen(v => !v)}
                  className="shrink-0 text-current/80 hover:text-current"
                  title="查看权限说明"
                >
                  <CircleHelp className="w-3.5 h-3.5" />
                </button>
              </div>
              {voicePermissionHelpOpen && (
                <div className="text-[10px] rounded-lg border border-white/10 bg-white/5 text-gray-300 px-2 py-2 space-y-1">
                  <div>说明：Agora 和 LiveKit 都会通过浏览器申请麦克风权限；是否弹窗取决于当前站点是否已经被浏览器记住“允许/拒绝”。</div>
                  <div>如果显示“已拒绝”，请点击地址栏左侧的权限图标，把麦克风改成“允许”，然后刷新页面再重试。</div>
                  <div>如果显示“未决定”，首次点击“开启实时语音”时浏览器可能会弹出授权框。</div>
                </div>
              )}
            </div>
            {showVoiceDebugPanel && (providerKind === 'agora' || providerKind === 'livekit') && (
              <div className="bg-black/30 border border-white/10 rounded-xl p-2">
                <div className="text-[10px] font-bold text-cyan-300 mb-2">
                  {providerKind === 'agora' ? 'Agora 调试日志' : 'LiveKit 调试日志'}
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {voiceDebugLogs.length === 0 ? (
                    <div className="text-[10px] text-gray-500">暂无日志，点击“开启实时语音”后会显示事件流</div>
                  ) : (
                    voiceDebugLogs.slice().reverse().map(log => (
                      <div key={log.id} className="text-[10px] text-gray-300 leading-4">
                        <span className="text-gray-500 mr-2">{new Date(log.ts).toLocaleTimeString()}</span>
                        <span className={log.scope === 'agora' || log.scope === 'livekit' ? 'text-cyan-300' : 'text-amber-300'}>[{log.scope}]</span>
                        <span className="ml-2">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {voiceMembers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {voiceMembers.map(member => {
                  const player = players.find(p => p.id === member.player_id);
                  const isSelf = currentPlayer?.id === member.player_id;
                  return (
                    <div key={member.id} className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-200 flex items-center gap-2">
                      <span>{(player?.name || '玩家')}{member.muted ? ' [静音]' : ' [在线]'}</span>
                      {!isSelf && (
                        <button
                          onClick={async () => {
                            const reason = window.prompt(`举报 ${player?.name || '该玩家'} 的语音原因`, '辱骂/骚扰/噪音');
                            if (!reason) return;
                            try {
                              await reportVoiceMember(member.player_id, reason);
                              alert('已提交举报');
                            } catch (e) {
                              alert(e instanceof Error ? e.message : '举报失败');
                            }
                          }}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-red-600/20 border border-red-500/30 text-red-200 hover:bg-red-600/30"
                        >
                          举报
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="h-56 md:h-64 overflow-y-auto bg-black/30 border border-white/10 rounded-2xl p-3 space-y-2">
            {messages.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-10">暂无消息</div>
            ) : (
              messages.map(m => (
                <div key={m.id} className="text-xs">
                  <div className="text-[10px] text-gray-400">
                    <span className={m.sender_name === '系统' ? 'text-yellow-400 font-bold' : 'text-gray-300'}>
                      {m.sender_name}
                    </span>
                    <span className="ml-2 text-gray-600">{new Date(m.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-gray-100 break-words">{m.content}</div>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={chatText}
              onChange={e => setChatText(e.target.value)}
              onFocus={() => setVoiceError(null)}
              onKeyDown={async e => {
                if (e.key !== 'Enter') return;
                const text = chatText;
                setChatText('');
                try {
                  await sendMessage(text);
                } catch (err) {
                  alert(err instanceof Error ? err.message : '发送失败');
                }
              }}
              placeholder="输入消息..."
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100"
            />
            <button
              onClick={async () => {
                const text = chatText;
                setChatText('');
                try {
                  await sendMessage(text);
                } catch (err) {
                  alert(err instanceof Error ? err.message : '发送失败');
                }
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameTable;
