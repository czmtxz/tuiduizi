import React, { useEffect, useMemo, useState } from 'react';
import { supabase, type Json } from '../lib/supabase';
import type { Position } from '../utils/gameLogic';

type Prediction = '赢' | '输' | null;

type PickedHand = {
  isPair: boolean;
  points: number;
};

type RecordStepItem = {
  index: number;
  bankerText: string;
  outcomeText: string;
  prediction: Prediction;
  actual: '赢' | '输';
  correct: boolean;
  bankerWin: number;
  bankerLose: number;
};

const RecordMode: React.FC = () => {
  const [recordCtx, setRecordCtx] = useState<{ roomId: string; playerId: string } | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [stepHistory, setStepHistory] = useState<RecordStepItem[]>([]);
  const [picked, setPicked] = useState<Record<Position, PickedHand | null>>({
    banker: null,
    chumen: null,
    zhongmen: null,
    momen: null,
  });
  const [prediction, setPrediction] = useState<Prediction>(null);
  const [pickerPos, setPickerPos] = useState<Position | null>(null);

  const positions = useMemo<Position[]>(() => ['banker', 'chumen', 'zhongmen', 'momen'], []);

  useEffect(() => {
    const run = async () => {
      try {
        const cachedRoomId = localStorage.getItem('tuiduizi_record_room_id');
        const cachedPlayerId = localStorage.getItem('tuiduizi_record_player_id');
        if (cachedRoomId && cachedPlayerId) {
          setRecordCtx({ roomId: cachedRoomId, playerId: cachedPlayerId });
          return;
        }
        const created = await createRecordContext();
        setRecordCtx(created);
      } finally {
        setCtxLoading(false);
      }
    };
    run();
  }, []);

  useEffect(() => {
    if (!recordCtx) return;
    const key = `tuiduizi_record_step_history_${recordCtx.roomId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const asObj = (v: unknown): Record<string, unknown> | null => {
          if (!v || typeof v !== 'object') return null;
          if (Array.isArray(v)) return null;
          return v as Record<string, unknown>;
        };

        const normalize = (v: unknown): RecordStepItem | null => {
          const o = asObj(v);
          if (!o) return null;
          if (typeof o.index !== 'number') return null;
          const bankerText = typeof o.bankerText === 'string' ? o.bankerText : '';
          const outcomeText = typeof o.outcomeText === 'string' ? o.outcomeText : '';
          const pred = o.prediction === '赢' || o.prediction === '输' ? o.prediction : null;
          const actual = o.actual === '赢' || o.actual === '输' ? o.actual : '赢';
          const correct = typeof o.correct === 'boolean' ? o.correct : false;
          const bankerWin = typeof o.bankerWin === 'number' ? o.bankerWin : 0;
          const bankerLose = typeof o.bankerLose === 'number' ? o.bankerLose : 0;
          return { index: o.index, bankerText, outcomeText, prediction: pred, actual, correct, bankerWin, bankerLose };
        };

        const normalized = parsed.map(normalize).filter((x): x is RecordStepItem => !!x).sort((a, b) => a.index - b.index);
        setStepHistory(normalized);
      }
    } catch {
      // ignore
    }
  }, [recordCtx]);

  const persistHistory = (next: RecordStepItem[]) => {
    if (!recordCtx) return;
    localStorage.setItem(`tuiduizi_record_step_history_${recordCtx.roomId}`, JSON.stringify(next));
  };

  const createRecordContext = async (): Promise<{ roomId: string; playerId: string }> => {
    const joinCode = `R${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({ join_code: joinCode, max_bet: 0, status: 'finished' })
      .select()
      .single();
    if (roomError || !room) throw roomError || new Error('创建记录房间失败');

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ room_id: room.id, name: '记录模式', role: 'banker', position: 'banker', is_ready: true })
      .select()
      .single();
    if (playerError || !player) throw playerError || new Error('创建记录玩家失败');

    await supabase.from('rooms').update({ banker_id: player.id }).eq('id', room.id);

    localStorage.setItem('tuiduizi_record_room_id', room.id);
    localStorage.setItem('tuiduizi_record_player_id', player.id);

    return { roomId: room.id, playerId: player.id };
  };

  const seatLabel = (pos: Position) => {
    if (pos === 'banker') return '庄家';
    if (pos === 'chumen') return '出门';
    if (pos === 'zhongmen') return '中门';
    return '末门';
  };

  const handText = (pos: Position, h: PickedHand | null) => {
    if (!h) return `${seatLabel(pos)}(未选)`;
    const prefix = pos === 'banker' ? '庄' : seatLabel(pos);
    if (h.isPair) return `${prefix}对${h.points}`;
    return `${prefix}${h.points}点`;
  };

  const playerWins = (player: PickedHand, banker: PickedHand) => {
    if (player.isPair && !banker.isPair) return true;
    if (!player.isPair && banker.isPair) return false;
    if (player.isPair && banker.isPair) return player.points > banker.points;
    if (player.points !== banker.points) return player.points > banker.points;
    return false;
  };

  const trendAnalysis = useMemo(() => {
    const last = stepHistory.slice(-5);
    if (last.length < 5) {
      return {
        ready: false,
        status: '需要连续记录5轮后才能分析趋势',
        statusLevel: 'neutral' as const,
        recommendedPrediction: null as Prediction,
        strongCount: 0,
        weakCount: 0,
        dominantOutcome: null as string | null,
        streakOutcome: null as string | null,
        streakLen: 0,
      };
    }

    const strongSet = new Set(['赢3', '赢2赔1']);
    const weakSet = new Set(['赢1赔2', '赔3']);

    let strongCount = 0;
    let weakCount = 0;
    const counts: Record<string, number> = {};
    for (const r of last) {
      const o = r.outcomeText;
      counts[o] = (counts[o] || 0) + 1;
      if (strongSet.has(o)) strongCount += 1;
      if (weakSet.has(o)) weakCount += 1;
    }

    let dominantOutcome: string | null = null;
    let dominantCount = 0;
    for (const [k, v] of Object.entries(counts)) {
      if (v > dominantCount) {
        dominantOutcome = k;
        dominantCount = v;
      }
    }

    const lastOutcome = last[last.length - 1]?.outcomeText || null;
    let streakLen = 0;
    if (lastOutcome) {
      for (let i = last.length - 1; i >= 0; i--) {
        if (last[i].outcomeText === lastOutcome) streakLen += 1;
        else break;
      }
    }

    const strongEmph = strongCount >= 4 || (lastOutcome && strongSet.has(lastOutcome) && streakLen >= 3);
    const weakEmph = weakCount >= 4 || (lastOutcome && weakSet.has(lastOutcome) && streakLen >= 3);

    let status = '均衡';
    let statusLevel: 'strong' | 'weak' | 'neutral' = 'neutral';
    if (strongEmph && !weakEmph) {
      status = '特别突出旺';
      statusLevel = 'strong';
    } else if (weakEmph && !strongEmph) {
      status = '特别突出弱';
      statusLevel = 'weak';
    } else if (strongCount > weakCount) {
      status = '旺';
      statusLevel = 'strong';
    } else if (weakCount > strongCount) {
      status = '弱';
      statusLevel = 'weak';
    }

    const recommendedPrediction: Prediction = statusLevel === 'strong' ? '赢' : statusLevel === 'weak' ? '输' : null;

    return {
      ready: true,
      status,
      statusLevel,
      recommendedPrediction,
      strongCount,
      weakCount,
      dominantOutcome,
      streakOutcome: lastOutcome,
      streakLen,
    };
  }, [stepHistory]);

  useEffect(() => {
    const emptyRound = !picked.banker && !picked.chumen && !picked.zhongmen && !picked.momen;
    if (!emptyRound) return;
    if (prediction !== null) return;
    if (!trendAnalysis.ready) return;
    if (!trendAnalysis.recommendedPrediction) return;
    setPrediction(trendAnalysis.recommendedPrediction);
  }, [picked, prediction, trendAnalysis.ready, trendAnalysis.recommendedPrediction]);

  const outcome = useMemo(() => {
    const banker = picked.banker;
    if (!banker) return null;
    const doors: Array<'chumen' | 'zhongmen' | 'momen'> = ['chumen', 'zhongmen', 'momen'];
    let loseCount = 0;
    for (const pos of doors) {
      const p = picked[pos];
      if (!p) return null;
      if (playerWins(p, banker)) loseCount += 1;
    }
    const winCount = 3 - loseCount;
    let label = `赢${winCount}赔${loseCount}`;
    if (winCount === 3) label = '赢3';
    if (loseCount === 3) label = '赔3';
    const actual: '赢' | '输' = loseCount <= 1 ? '赢' : '输';
    return { loseCount, winCount, label, actual };
  }, [picked]);

  const nextIndex = (stepHistory[stepHistory.length - 1]?.index || 0) + 1;

  const predictionStats = useMemo(() => {
    const total = stepHistory.length;
    const wins = stepHistory.filter(x => x.actual === '赢').length;
    const losses = total - wins;
    const withPred = stepHistory.filter(x => x.prediction === '赢' || x.prediction === '输');
    const correct = withPred.filter(x => x.correct).length;
    let streak = 0;
    for (let i = total - 1; i >= 0; i--) {
      if (i === total - 1) {
        streak = 1;
        continue;
      }
      if (stepHistory[i].actual === stepHistory[i + 1].actual) streak += 1;
      else break;
    }
    const trend = total === 0 ? null : stepHistory[total - 1].actual;
    return {
      total,
      wins,
      losses,
      trend,
      streak,
      predTotal: withPred.length,
      predCorrect: correct,
    };
  }, [stepHistory]);

  const resetRound = () => {
    setPicked({ banker: null, chumen: null, zhongmen: null, momen: null });
    setPrediction(null);
    setPickerPos(null);
  };

  const clearHistory = () => {
    setStepHistory([]);
    if (recordCtx) {
      localStorage.removeItem(`tuiduizi_record_step_history_${recordCtx.roomId}`);
    }
  };

  const saveRound = async () => {
    const ctx = recordCtx ?? (await createRecordContext().catch(() => null));
    if (!ctx) {
      alert('记录模式初始化失败，请刷新页面重试');
      return;
    }
    if (!recordCtx) setRecordCtx(ctx);

    if (!outcome) {
      alert('请先选择庄家与三门点数');
      return;
    }

    const banker = picked.banker;
    const chumen = picked.chumen;
    const zhongmen = picked.zhongmen;
    const momen = picked.momen;
    if (!banker || !chumen || !zhongmen || !momen) {
      alert('请先选择庄家与三门点数');
      return;
    }

    const bankerText = handText('banker', banker);
    const outcomeText = outcome.label;
    const actual = outcome.actual;
    const correct = prediction ? prediction === actual : false;

    const nextItem: RecordStepItem = {
      index: nextIndex,
      bankerText,
      outcomeText,
      prediction,
      actual,
      correct,
      bankerWin: outcome.winCount,
      bankerLose: outcome.loseCount,
    };

    const next = [...stepHistory, nextItem].sort((a, b) => a.index - b.index);
    setStepHistory(next);
    persistHistory(next);

    const results = {
      banker: { position: 'banker', cards: [], points: banker.points, isPair: banker.isPair, maxSingle: banker.points },
      chumen: { position: 'chumen', cards: [], points: chumen.points, isPair: chumen.isPair, maxSingle: chumen.points },
      zhongmen: { position: 'zhongmen', cards: [], points: zhongmen.points, isPair: zhongmen.isPair, maxSingle: zhongmen.points },
      momen: { position: 'momen', cards: [], points: momen.points, isPair: momen.isPair, maxSingle: momen.points },
    };

    let bankerTotalPL = 0;
    const perDoor: Record<string, number> = {};
    for (const pos of ['chumen', 'zhongmen', 'momen'] as const) {
      const p = results[pos];
      const bw = playerWins({ isPair: p.isPair, points: p.points }, { isPair: results.banker.isPair, points: results.banker.points });
      const v = bw ? 1 : -1;
      perDoor[pos] = v;
      bankerTotalPL -= v;
    }

    const pl: Record<string, number | Record<string, unknown>> = {
      ...perDoor,
      banker: bankerTotalPL,
      summary: {
        roundIndex: nextIndex,
        bankerLose: outcome.loseCount,
        bankerWin: outcome.winCount,
        label: outcome.label,
        prediction,
        actual,
        correct,
      },
    };

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id || null;

    const { error } = await supabase
      .from('game_records')
      .insert({
        room_id: ctx.roomId,
        player_id: ctx.playerId,
        user_id: userId,
        dice_result: ([0, 0] as unknown as Json),
        card_distribution: results as unknown as Json,
        comparison_result: results as unknown as Json,
        profit_loss: pl as unknown as Json,
      });

    if (error) {
      alert('保存失败: ' + error.message);
      return;
    }

    resetRound();
  };

  const pickerOptions = useMemo(() => {
    const pairs = Array.from({ length: 9 }, (_, i) => i + 1).map(v => ({ label: `对${v}`, value: { isPair: true, points: v } }));
    const points = Array.from({ length: 10 }, (_, i) => i).map(v => ({ label: `${v}点`, value: { isPair: false, points: v } }));
    return { pairs, points };
  }, []);

  const pickFor = (pos: Position, h: PickedHand) => {
    setPicked(prev => ({ ...prev, [pos]: h }));
    setPickerPos(null);
  };

  return (
    <div className="p-4 md:p-6 bg-gray-900 rounded-2xl border border-gray-700 text-white max-w-2xl mx-auto shadow-2xl">
      <div className="flex justify-between items-center mb-4">
        <div className="flex flex-col">
          <h2 className="text-2xl font-bold text-gold-500">记录模式</h2>
          <div className="text-[10px] text-gray-500">第 {nextIndex} 轮（按庄家维度连续编号）</div>
        </div>
        <div className="flex gap-2">
          <button onClick={clearHistory} className="px-3 py-1 rounded-full text-[10px] font-bold bg-gray-800 border border-white/10">
            清空记录
          </button>
        </div>
      </div>

      {ctxLoading && (
        <div className="text-xs text-gray-400 bg-black/30 border border-white/10 rounded-xl p-3 mb-4">
          正在初始化记录模式...
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {positions.map(pos => (
          <button
            key={pos}
            onClick={() => setPickerPos(pos)}
            className={`rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
              pos === 'banker'
                ? 'bg-red-900/20 border-red-900/30'
                : 'bg-black/25 border-white/10'
            }`}
          >
            <div className="text-[10px] text-gray-400">{seatLabel(pos)}</div>
            <div className="mt-1 text-lg font-black text-yellow-400">{picked[pos] ? handText(pos, picked[pos]) : '点击选择'}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-gray-300">本轮预测（庄家视角）</div>
          <div className="flex gap-2">
            <button
              onClick={() => setPrediction('赢')}
              className={`px-3 py-1 rounded-full text-[10px] font-bold border ${prediction === '赢' ? 'bg-green-600 border-green-400 text-white' : 'bg-gray-800 border-white/10 text-gray-200'}`}
            >
              预测赢
            </button>
            <button
              onClick={() => setPrediction('输')}
              className={`px-3 py-1 rounded-full text-[10px] font-bold border ${prediction === '输' ? 'bg-red-600 border-red-400 text-white' : 'bg-gray-800 border-white/10 text-gray-200'}`}
            >
              预测输
            </button>
            <button
              onClick={() => setPrediction(null)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold border ${prediction === null ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-800 border-white/10 text-gray-200'}`}
            >
              不预测
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-[10px] text-gray-400">
            系统分析（近5轮）：
            <span
              className={`ml-1 font-black text-sm md:text-base ${
                trendAnalysis.statusLevel === 'strong'
                  ? 'text-red-400'
                  : trendAnalysis.statusLevel === 'weak'
                    ? 'text-green-400'
                    : 'text-gray-300'
              }`}
            >
              {trendAnalysis.status}
            </span>
            {trendAnalysis.ready && (
              <span className="ml-2">
                旺:{trendAnalysis.strongCount} 弱:{trendAnalysis.weakCount}
                {trendAnalysis.dominantOutcome ? `｜高频:${trendAnalysis.dominantOutcome}` : ''}
                {trendAnalysis.streakOutcome ? `｜连${trendAnalysis.streakLen}次:${trendAnalysis.streakOutcome}` : ''}
              </span>
            )}
          </div>

          {trendAnalysis.ready && trendAnalysis.recommendedPrediction && (
            <button
              onClick={() => setPrediction(trendAnalysis.recommendedPrediction)}
              className="px-3 py-1 rounded-full text-[10px] font-bold bg-gray-800 border border-white/10 text-gray-200"
            >
              采用系统预测({trendAnalysis.recommendedPrediction})
            </button>
          )}
        </div>

        <div className="mt-2 text-[10px] text-gray-400">
          {outcome ? (
            <>
              实际走势：<span className="text-yellow-400 font-bold">{outcome.label}</span>（本轮 {outcome.actual}）
              {prediction && (
                <span className="ml-2">预测 {prediction} {prediction === outcome.actual ? '✅' : '❌'}</span>
              )}
            </>
          ) : (
            <>选择完庄家与三门点数后，会自动计算本轮走势</>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={resetRound}
          className="flex-1 bg-gray-800 border border-white/10 text-gray-200 font-bold py-3 rounded-xl text-sm"
        >
          重置本轮
        </button>
        <button
          onClick={saveRound}
          className="flex-[2] bg-gold-500 text-black font-black py-3 rounded-xl shadow-lg text-sm"
        >
          记录本轮
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-xl bg-black/25 border border-white/10 p-2">
          <div className="text-[10px] text-gray-400">总轮数</div>
          <div className="text-lg font-black text-gray-100">{predictionStats.total}</div>
        </div>
        <div className="rounded-xl bg-black/25 border border-white/10 p-2">
          <div className="text-[10px] text-gray-400">庄赢/庄输</div>
          <div className="text-lg font-black text-gray-100">{predictionStats.wins}/{predictionStats.losses}</div>
        </div>
        <div className="rounded-xl bg-black/25 border border-white/10 p-2">
          <div className="text-[10px] text-gray-400">当前趋势</div>
          <div className="text-lg font-black text-yellow-400">{predictionStats.trend ? `${predictionStats.trend}×${predictionStats.streak}` : '-'}</div>
        </div>
        <div className="rounded-xl bg-black/25 border border-white/10 p-2">
          <div className="text-[10px] text-gray-400">预测命中</div>
          <div className="text-lg font-black text-gray-100">{predictionStats.predCorrect}/{predictionStats.predTotal}</div>
        </div>
      </div>

      {stepHistory.length > 0 && (
        <div className="mt-4 bg-black/30 border border-white/10 rounded-2xl p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[10px] text-gray-400">连续记录（按轮号顺序）</div>
          </div>
          <div className="text-xs text-gray-100 whitespace-nowrap overflow-x-auto pb-1">
            {stepHistory.map(x => `${x.index}.${x.outcomeText}`).join('  ')}
          </div>
          <div className="mt-2 space-y-1">
            {stepHistory
              .slice()
              .reverse()
              .slice(0, 30)
              .map(x => (
                <div key={x.index} className="flex items-center justify-between gap-2 text-[10px]">
                  <div className="text-gray-200 whitespace-nowrap">第{x.index}轮｜{x.bankerText}｜{x.outcomeText}</div>
                  <div className="text-gray-400 whitespace-nowrap">
                    预测:{x.prediction ?? '-'} 实际:{x.actual} {x.prediction ? (x.correct ? '✅' : '❌') : ''}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {pickerPos && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end md:items-center justify-center p-4">
          <div className="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold text-gold-500">选择{seatLabel(pickerPos)}点数</div>
              <button onClick={() => setPickerPos(null)} className="text-xs text-gray-400 underline">关闭</button>
            </div>
            <div className="text-[10px] text-gray-400 mb-2">对子优先（对1~对9）；否则选 0~9 点</div>
            <div className="grid grid-cols-5 gap-2">
              {pickerOptions.pairs.map(o => (
                <button
                  key={o.label}
                  onClick={() => pickFor(pickerPos, o.value)}
                  className="py-2 rounded-xl bg-red-600/20 border border-red-500/30 text-red-300 font-bold text-xs"
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {pickerOptions.points.map(o => (
                <button
                  key={o.label}
                  onClick={() => pickFor(pickerPos, o.value)}
                  className="py-2 rounded-xl bg-gray-800 border border-white/10 text-gray-100 font-bold text-xs"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecordMode;
