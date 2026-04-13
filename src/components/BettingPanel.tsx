import React, { useEffect, useMemo, useState } from 'react';
import { useBetting, BetType } from '../hooks/useBetting';
import { supabase } from '../lib/supabase';
import { Position } from '../utils/gameLogic';
import { useAudio } from '../audio/audioStore';

interface BettingPanelProps {
  roundId: string;
  playerId: string;
  maxBet: number;
  betStep: number;
  touziMinBet: number;
  touziMaxBet: number;
  chaMinBet: number;
  chaMaxBet: number;
  allowHong: boolean;
  hongMinBet: number;
  hongMaxBet: number;
  disabled?: boolean;
  disabledReason?: string;
  requiredPosition?: Position | null;
  requiredDone?: boolean;
}

const BettingPanel: React.FC<BettingPanelProps> = ({
  roundId,
  playerId,
  maxBet,
  betStep,
  touziMinBet,
  touziMaxBet,
  chaMinBet,
  chaMaxBet,
  allowHong,
  hongMinBet,
  hongMaxBet,
  disabled = false,
  disabledReason,
  requiredPosition,
  requiredDone,
}) => {
  const { placeBet } = useBetting();
  const playSfx = useAudio(s => s.playSfx);
  const enqueueVoiceText = useAudio(s => s.enqueueVoiceText);

  useEffect(() => {
    if (disabled) return;
    if (!requiredPosition || requiredPosition === 'banker') return;
    if (requiredDone) return;
    const id = window.setTimeout(() => {
      enqueueVoiceText('睡着了吗？', {
        priority: 4,
        interrupt: false,
        dedupeKey: `timeout-${roundId}-${playerId}`,
        cooldownMs: 60_000,
        pitch: 1.1,
        rate: 1.05,
      });
    }, 12_000);
    return () => window.clearTimeout(id);
  }, [disabled, requiredPosition, requiredDone, roundId, playerId, enqueueVoiceText]);
  const [selectedType, setSelectedType] = useState<BetType>('touzi');
  const [selectedPos, setSelectedPos] = useState<Position>('chumen');
  const [amount, setAmount] = useState(100);
  const [crossPos, setCrossPos] = useState<Position[]>(['chumen', 'zhongmen']);
  const [repeatLoading, setRepeatLoading] = useState(false);

  useEffect(() => {
    if (!allowHong && selectedType === 'hong') setSelectedType('touzi');
  }, [allowHong, selectedType]);

  useEffect(() => {
    if (!requiredPosition) return;
    if (requiredPosition === 'banker') return;
    setSelectedPos(requiredPosition);
  }, [requiredPosition, roundId]);

  const betTypes: { label: string; value: BetType }[] = (
    [
      { label: '头子', value: 'touzi' },
      { label: '两道', value: 'liangdao' },
      { label: '三道', value: 'sandao' },
      { label: '叉注', value: 'cha' },
      { label: '对子道', value: 'duizi' },
      ...(allowHong ? ([{ label: '赌红', value: 'hong' }] as const) : []),
    ]
  ) as { label: string; value: BetType }[];

  const positions: { label: string; value: Position }[] = [
    { label: '出门', value: 'chumen' },
    { label: '中门', value: 'zhongmen' },
    { label: '末门', value: 'momen' },
  ];

  const range = useMemo(() => {
    if (selectedType === 'cha') return { min: chaMinBet, max: Math.min(chaMaxBet, maxBet) };
    if (selectedType === 'hong') return { min: hongMinBet, max: Math.min(hongMaxBet, maxBet) };
    return { min: touziMinBet, max: Math.min(touziMaxBet, maxBet) };
  }, [selectedType, chaMinBet, chaMaxBet, hongMinBet, hongMaxBet, touziMinBet, touziMaxBet, maxBet]);

  const amountStep = useMemo(() => {
    if (selectedType === 'liangdao' || selectedType === 'sandao') return 100;
    return betStep;
  }, [selectedType, betStep]);

  useEffect(() => {
    setAmount(prev => {
      const stepped = Math.round(prev / amountStep) * amountStep;
      return Math.max(range.min, Math.min(range.max, stepped));
    });
  }, [range.min, range.max, amountStep]);

  const handlePlaceBet = async () => {
    if (disabled) {
      alert(disabledReason || '当前不能下注');
      return;
    }

    const { min, max } = range;
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('下注金额不合法');
      return;
    }
    if (selectedType === 'liangdao' || selectedType === 'sandao') {
      if (amount % 100 !== 0) {
        alert('两道/三道下注金额必须是 100 的倍数');
        return;
      }
    } else if (amount % betStep !== 0) {
      alert(`下注金额必须是 ${betStep} 的倍数`);
      return;
    }
    if (amount < min || amount > max) {
      alert(`下注金额范围：${min} ~ ${max}`);
      return;
    }
    
    try {
      const posToUse = (selectedType === 'cha' || selectedType === 'hong')
        ? (requiredPosition || selectedPos)
        : selectedPos;
      await placeBet(roundId, playerId, selectedType, posToUse, amount, selectedType === 'cha' ? crossPos : undefined);
      alert('下注成功');
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : '下注失败';
      alert(message);
    }
  };

  const { min: amountMin, max: amountMax } = range;

  const quickAmounts = useMemo(() => {
    const out: number[] = [];
    const limit = 6;
    const start = Math.ceil(amountMin / amountStep) * amountStep;
    for (let v = start; v <= amountMax && out.length < limit; v += amountStep) out.push(v);
    if (out.length > 0 && out[out.length - 1] !== amountMax) out.push(amountMax);
    if (out.length === 0) out.push(amountMax);
    return out;
  }, [amountMin, amountMax, amountStep]);

  return (
    <div className="p-3 md:p-4 bg-gray-800 rounded-xl shadow-lg border border-gray-700 text-white w-full max-w-md">
      <h3 className="text-lg md:text-xl font-bold mb-3 md:mb-4 text-gold-500">下注控制面板</h3>

      <button
        disabled={disabled || repeatLoading}
        onClick={async () => {
          playSfx('click');
          if (disabled) {
            alert(disabledReason || '当前不能下注');
            return;
          }
          if (!requiredPosition || requiredPosition === 'banker') {
            alert('当前不是闲家位置');
            return;
          }
          setRepeatLoading(true);
          try {
            const { data: curRound, error: curRoundErr } = await supabase
              .from('rounds')
              .select('room_id, round_number')
              .eq('id', roundId)
              .single();
            if (curRoundErr || !curRound) throw new Error('读取当前轮次失败');
            if (!curRound.round_number || curRound.round_number <= 1) {
              alert('没有上一轮可以复下');
              return;
            }

            const prevNo = curRound.round_number - 1;
            const { data: prevRound, error: prevErr } = await supabase
              .from('rounds')
              .select('id')
              .eq('room_id', curRound.room_id)
              .eq('round_number', prevNo)
              .maybeSingle();
            if (prevErr || !prevRound) {
              alert('未找到上一轮');
              return;
            }

            const { data: prevBets, error: betErr } = await supabase
              .from('bets')
              .select('bet_type, position, amount, cross_positions')
              .eq('round_id', prevRound.id)
              .eq('player_id', playerId);
            if (betErr) throw betErr;
            if (!prevBets || prevBets.length === 0) {
              alert('上一轮没有下注记录');
              return;
            }

            for (const b of prevBets) {
              const row = b as unknown as {
                bet_type: string;
                position: string;
                amount: number;
                cross_positions: unknown;
              };
              const t = row.bet_type as BetType;
              const p = row.position as Position;
              const a = Number(row.amount);
              const crossArr = Array.isArray(row.cross_positions) ? (row.cross_positions as unknown as Position[]) : undefined;
              if (!Number.isFinite(a) || a <= 0) continue;
              await placeBet(roundId, playerId, t, p, a, t === 'cha' ? crossArr : undefined);
            }
            enqueueVoiceText('复下上一轮成功。', { priority: 1, interrupt: false, dedupeKey: `repeat-${roundId}-${playerId}`, cooldownMs: 10_000, pitch: 1.0, rate: 1.0 });
            alert('复下上一轮成功');
          } catch (err) {
            alert(err instanceof Error ? err.message : '复下失败');
          } finally {
            setRepeatLoading(false);
          }
        }}
        className="mb-3 w-full bg-black/30 hover:bg-white/5 disabled:opacity-50 border border-white/10 rounded-xl py-2 text-xs font-black"
      >
        {repeatLoading ? '复下中...' : '复下上一轮'}
      </button>

      {requiredPosition && requiredPosition !== 'banker' && (
        <div className="mb-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-gray-300">
          必须至少下注自己这一门一次：
          <span className="ml-1 font-bold text-yellow-400">
            {requiredPosition === 'chumen' ? '出门' : requiredPosition === 'zhongmen' ? '中门' : '末门'}
          </span>
          {typeof requiredDone === 'boolean' && (
            <span className={`ml-2 font-bold ${requiredDone ? 'text-green-400' : 'text-red-400'}`}>
              {requiredDone ? '已完成✅' : '未完成⏳'}
            </span>
          )}
        </div>
      )}

      {disabled && (
        <div className="mb-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-gray-300">
          {disabledReason || '下注已关闭'}
        </div>
      )}
      
      <div className="space-y-3 md:space-y-4">
        {/* Type Selection */}
        <div>
          <label className="block text-[10px] md:text-sm font-medium mb-1 text-gray-400">下注类型</label>
          <div className="grid grid-cols-3 gap-1 md:gap-2">
            {betTypes.map(type => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className={`py-1.5 md:py-2 px-1 rounded border text-[10px] md:text-sm transition ${
                  selectedType === type.value 
                    ? 'bg-blue-600 border-blue-400' 
                    : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Position Selection */}
        {selectedType !== 'cha' && selectedType !== 'hong' && (
          <div>
            <label className="block text-[10px] md:text-sm font-medium mb-1 text-gray-400">下注位置</label>
            <div className="flex gap-1 md:gap-2">
              {positions.map(pos => (
                <button
                  key={pos.value}
                  onClick={() => setSelectedPos(pos.value)}
                  className={`flex-1 py-1.5 md:py-2 rounded border text-[10px] md:text-sm transition ${
                    selectedPos === pos.value 
                      ? 'bg-green-600 border-green-400' 
                      : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cross Position Selection */}
        {selectedType === 'cha' && (
          <div>
            <label className="block text-[10px] md:text-sm font-medium mb-1 text-gray-400">叉注位置 (选两项)</label>
            <div className="flex gap-1 md:gap-2">
              {[
                { label: '出中', value: ['chumen', 'zhongmen'] },
                { label: '中末', value: ['zhongmen', 'momen'] },
                { label: '末出', value: ['momen', 'chumen'] },
              ].map((combo, idx) => (
                <button
                  key={idx}
                  onClick={() => setCrossPos(combo.value as Position[])}
                  className={`flex-1 py-1.5 md:py-2 rounded border transition text-[10px] md:text-xs ${
                    JSON.stringify(crossPos) === JSON.stringify(combo.value)
                      ? 'bg-purple-600 border-purple-400' 
                      : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                  }`}
                >
                  {combo.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Amount Selection */}
        <div>
          <label className="block text-[10px] md:text-sm font-medium mb-1 text-gray-400">
            金额 (范围: {amountMin} ~ {amountMax}，步长: {amountStep})
          </label>
          <div className="flex flex-col gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              step={amountStep}
              min={amountMin}
              max={amountMax}
              className="w-full bg-gray-900 border border-gray-600 rounded py-2 px-3 text-white focus:outline-none focus:border-blue-500 text-sm"
            />
            <div className="flex gap-1 overflow-x-auto pb-1">
              {quickAmounts.map(val => (
                <button
                  key={val}
                  onClick={() => setAmount(val)}
                  className="px-3 py-1 bg-gray-700 rounded text-[10px] hover:bg-gray-600 whitespace-nowrap"
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handlePlaceBet}
          disabled={disabled}
          className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-2.5 md:py-3 rounded-lg shadow-lg transition transform active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          确认下注
        </button>
      </div>
    </div>
  );
};

export default BettingPanel;
