import React, { useEffect, useRef, useState } from 'react';
import GameTable from './components/GameTable';
import BettingPanel from './components/BettingPanel';
import RecordMode from './components/RecordMode';
import HistoryAnalysis from './components/HistoryAnalysis';
import RoomListPanel from './components/RoomListPanel';
import AdminPanel from './components/AdminPanel';
import AuthModal from './components/AuthModal';
import OnlinePlayersPanel from './components/OnlinePlayersPanel';
import { useGame } from './hooks/useGame';
import { supabase } from './lib/supabase';
import { useBetting } from './hooks/useBetting';
import { positionLabel } from './utils/labels';
import { useAudio } from './audio/audioStore';
import { AudioSettingsModal } from './audio/AudioSettingsModal';
import { AudioUnlockBanner } from './audio/AudioUnlockBanner';
import { getBetSyncPlayback, getBetSyncSfxId, type BetAudioEventRow } from './audio/betSync';

type Mode = 'auto' | 'record' | 'history' | 'admin';

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>('auto');
  const { room, currentPlayer, currentRound, startPos, betStatus, joinRoom, createRoom, invites, refreshInvites, setReady } = useGame();
  const { placeBet } = useBetting();
  const autoBetRoundIdRef = useRef<string | null>(null);
  const inviteCountRef = useRef(0);

  const setAudioOpen = useAudio(s => s.setSettingsOpen);
  const playSfx = useAudio(s => s.playSfx);
  const enqueueVoiceText = useAudio(s => s.enqueueVoiceText);
  const playBgm = useAudio(s => s.playBgm);
  const stopBgm = useAudio(s => s.stopBgm);
  const audioPrefs = useAudio(s => s.prefs);

  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  
  const [joinCode, setJoinCode] = useState('');
  const makeDefaultJoinCode = () => String(1000 + Math.floor(Math.random() * 9000));
  const [createJoinCode, setCreateJoinCode] = useState(makeDefaultJoinCode);
  const [maxBet, setMaxBet] = useState(1000);
  const betStep = 50;
  const [touziMin, setTouziMin] = useState(50);
  const [touziMax, setTouziMax] = useState(1000);
  const [chaMin, setChaMin] = useState(50);
  const [chaMax, setChaMax] = useState(1000);
  const [allowHong, setAllowHong] = useState(false);
  const [hongMin, setHongMin] = useState(50);
  const [hongMax, setHongMax] = useState(1000);
  const [showBetting, setShowBetting] = useState(false);

  const normalizeToStep = (value: number, min: number, max: number) => {
    const stepped = Math.round(value / betStep) * betStep;
    return Math.max(min, Math.min(max, stepped));
  };

  useEffect(() => {
    const nextMax = Math.max(50, Math.round(maxBet / betStep) * betStep);
    setTouziMax(nextMax);
    setChaMax(nextMax);
    setHongMax(nextMax);
    setTouziMin(v => normalizeToStep(v, 50, nextMax));
    setChaMin(v => normalizeToStep(v, 50, nextMax));
    setHongMin(v => normalizeToStep(v, 50, nextMax));
  }, [maxBet]);

  const handleJoin = async () => {
    if (!joinCode) return alert('请输入房间号');
    try {
      await joinRoom(joinCode, '', 'player');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '加入房间失败';
      if (message.includes('游客身份初始化失败') || message.includes('Anonymous sign-ins') || message.includes('已关闭游客模式')) {
        setAuthModalOpen(true);
        return;
      }
      alert(message);
    }
  };

  useEffect(() => {
    if (mode !== 'auto') return;
    if (room) return;
    const lastJoinCode = localStorage.getItem('tuiduizi_last_join_code') || '';
    const lastRole = (localStorage.getItem('tuiduizi_last_role') || 'player') as 'player' | 'banker';
    if (!lastJoinCode) return;

    joinRoom(lastJoinCode, '', lastRole).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('游客身份初始化失败') || message.includes('Anonymous sign-ins') || message.includes('已关闭游客模式')) {
        setAuthModalOpen(true);
      }
    });
  }, [mode, room, joinRoom]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setAuthEmail(data.session?.user.email || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthEmail(session?.user.email || null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!room || !currentRound || startPos) return;
    if (!currentPlayer?.position) return;
    if (currentPlayer.position !== 'chumen' && currentPlayer.position !== 'zhongmen' && currentPlayer.position !== 'momen') return;

    if (autoBetRoundIdRef.current === currentRound.id) return;
    autoBetRoundIdRef.current = currentRound.id;

    const id = window.setTimeout(async () => {
      try {
        const pos = currentPlayer.position;
        const { data: betRows } = await supabase
          .from('bets')
          .select('id, bet_type')
          .eq('round_id', currentRound.id)
          .eq('player_id', currentPlayer.id)
          .eq('position', pos);
        const ok = (betRows || []).some(b => ['touzi', 'liangdao', 'sandao', 'duizi'].includes(String(b.bet_type)));
        if (ok) return;

        const minAmount = room.touzi_min_bet || 50;
        await placeBet(currentRound.id, currentPlayer.id, 'touzi', pos, minAmount);
      } catch {
        void 0;
      }
    }, 10_000);

    return () => {
      window.clearTimeout(id);
    };
  }, [room, currentRound, startPos, currentPlayer, placeBet]);

  const handleQuickJoin = async (code: string) => {
    try {
      await joinRoom(code, '', 'player');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '加入房间失败';
      if (message.includes('游客身份初始化失败') || message.includes('Anonymous sign-ins') || message.includes('已关闭游客模式')) {
        setAuthModalOpen(true);
        return;
      }
      alert(message);
    }
  };

  useEffect(() => {
    if (mode !== 'auto') return;
    if (room) return;
    refreshInvites().catch(() => void 0);
    const id = window.setInterval(() => {
      refreshInvites().catch(() => void 0);
    }, 2500);
    return () => window.clearInterval(id);
  }, [mode, room, refreshInvites]);

  useEffect(() => {
    const next = invites.length;
    if (next > inviteCountRef.current) {
      const last = invites[0];
      const seed = last?.inviter_player_id ? String(last.inviter_player_id) : String(next);
      let hash = 0;
      for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
      const pan = Math.max(-1, Math.min(1, (hash % 100) / 100));
      playSfx('ding', { pan });
      enqueueVoiceText('叮~有牌友找你开黑啦！', { priority: 6, interrupt: true, dedupeKey: 'invite', cooldownMs: 1500, pitch: 1.15, rate: 1.05 });
    }
    inviteCountRef.current = next;
  }, [invites, enqueueVoiceText, playSfx]);

  const roomId = room?.id || null;
  useEffect(() => {
    if (!roomId) {
      playBgm('lobby');
      return;
    }
    playBgm('room');
    return () => {
      stopBgm();
    };
  }, [roomId, playBgm, stopBgm]);

  useEffect(() => {
    if (!roomId) return;
    const seen = new Set<string>();
    const timers = new Map<string, number>();
    const channel = supabase
      .channel(`bet-sync-audio-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audio_event_logs', filter: `room_id=eq.${roomId}` },
        payload => {
          const row = payload.new as unknown as BetAudioEventRow;
          if (!row?.id || seen.has(row.id)) return;
          seen.add(row.id);
          if (!audioPrefs.betSyncSfxEnabled) return;

          const scheduled = new Date(row.scheduled_at).getTime();
          const delay = Math.max(0, Math.min(1500, scheduled - Date.now()));
          const timer = window.setTimeout(() => {
            const sfxId = getBetSyncSfxId(row.bet_type);
            const opts = getBetSyncPlayback(row.bet_type, row.amount);
            playSfx(sfxId, opts);
            console.info('[bet-sync-audio]', {
              eventId: row.id,
              betType: row.bet_type,
              amount: row.amount,
              locale: row.locale,
              scheduledAt: row.scheduled_at,
              actualPlayAt: new Date().toISOString(),
            });
            timers.delete(row.id);
          }, delay);
          timers.set(row.id, timer);
        }
      )
      .subscribe();

    return () => {
      timers.forEach(id => window.clearTimeout(id));
      void supabase.removeChannel(channel);
    };
  }, [roomId, playSfx, audioPrefs.betSyncSfxEnabled]);

  useEffect(() => {
    if (!roomId) return;
    const seen = new Set<string>();
    const timers = new Map<string, number>();
    const channel = supabase
      .channel(`voice-public-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'voice_event_logs', filter: `room_id=eq.${roomId}` },
        payload => {
          const row = payload.new as unknown as { id?: string; text?: string; scheduled_at?: string };
          if (!row?.id || seen.has(row.id)) return;
          seen.add(row.id);
          if (!audioPrefs.voiceEnabled) return;
          const text = String(row.text || '').trim();
          if (!text) return;

          const scheduled = row.scheduled_at ? new Date(row.scheduled_at).getTime() : Date.now();
          const delay = Math.max(0, Math.min(1500, scheduled - Date.now()));
          const timer = window.setTimeout(() => {
            enqueueVoiceText(text, { priority: 8, interrupt: true, dedupeKey: `public-voice-${row.id}`, cooldownMs: 3000, pitch: 1.0, rate: 1.02 });
            timers.delete(row.id as string);
          }, delay);
          timers.set(row.id, timer);
        }
      )
      .subscribe();

    return () => {
      timers.forEach(id => window.clearTimeout(id));
      void supabase.removeChannel(channel);
    };
  }, [roomId, enqueueVoiceText, audioPrefs.voiceEnabled]);

  const handleCreate = async () => {
    try {
      const max = Math.max(50, Math.round(maxBet / betStep) * betStep);
      const tMin = normalizeToStep(touziMin, 50, max);
      const tMax = normalizeToStep(touziMax, tMin, max);
      const cMin = normalizeToStep(chaMin, 50, max);
      const cMax = normalizeToStep(chaMax, cMin, max);
      const hMin = normalizeToStep(hongMin, 50, max);
      const hMax = normalizeToStep(hongMax, hMin, max);
      const normalizedJoinCode = createJoinCode.trim().toUpperCase();
      if (normalizedJoinCode) {
        if (normalizedJoinCode.length < 4 || normalizedJoinCode.length > 6) {
          return alert('房间号长度需要 4~6 位');
        }
        if (!/^[A-Z0-9]+$/.test(normalizedJoinCode)) {
          return alert('房间号只能包含数字和大写字母');
        }
      }

      await createRoom('', {
        joinCode: normalizedJoinCode || undefined,
        maxBet: max,
        betStep,
        touziMin: tMin,
        touziMax: tMax,
        chaMin: cMin,
        chaMax: cMax,
        allowHong,
        hongMin: hMin,
        hongMax: hMax,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '创建房间失败';
      alert(message);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-2 md:p-8 font-sans selection:bg-gold-500/30">
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-6 md:mb-8 gap-4">
        <h1 className="text-3xl md:text-4xl font-black text-gold-500 tracking-tighter italic">
          麻将推对子 <span className="text-[10px] md:text-xs font-normal text-gray-500 not-italic ml-2">v1.0</span>
        </h1>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              playSfx('click');
              setAudioOpen(true);
            }}
            className="text-xs md:text-sm font-bold px-4 py-2 rounded-full bg-black/30 border border-white/10 text-gray-200 hover:bg-white/5"
          >
            音频
          </button>
          <button
            onClick={() => setAuthModalOpen(true)}
            className="text-xs md:text-sm font-bold px-4 py-2 rounded-full bg-black/30 border border-white/10 text-gray-200 hover:bg-white/5"
          >
            {authEmail ? authEmail : '登录/注册'}
          </button>
          {authEmail && (
            <button
              onClick={async () => {
                await supabase.auth.signOut();
              }}
              className="text-xs md:text-sm font-bold px-4 py-2 rounded-full bg-gray-800 border border-white/10 text-gray-200 hover:bg-gray-700"
            >
              退出
            </button>
          )}

          <nav className="flex bg-gray-900/50 p-1 rounded-full border border-gray-800 shadow-xl backdrop-blur-md overflow-x-auto max-w-full">
          {[
            { id: 'auto', label: '游戏' },
            { id: 'record', label: '手动' },
            { id: 'history', label: '战绩' },
            { id: 'admin', label: '管理' }
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id as Mode)}
              className={`px-4 md:px-6 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-bold transition-all duration-300 whitespace-nowrap ${
                mode === m.id 
                  ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {m.label}
            </button>
          ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {mode === 'auto' && (
          <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <AudioUnlockBanner />
            {!room ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                <div className="bg-gray-900/80 p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl">
                  <h2 className="text-xl md:text-2xl font-bold mb-6 text-center text-gray-200">欢迎进入游戏大厅</h2>
                  {invites.length > 0 && (
                    <div className="mb-6 bg-black/30 border border-gold-500/20 rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-black text-gold-500">房间邀请</div>
                        <div className="text-[10px] text-gray-500">{invites.length} 条</div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {invites.slice(0, 6).map(inv => (
                          <div key={inv.id} className="flex items-center justify-between gap-2 bg-gray-900/60 border border-white/10 rounded-xl px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-xs text-gray-200 truncate">
                                邀请加入房间 <span className="font-mono text-gold-500">{inv.join_code}</span>
                              </div>
                              <div className="text-[10px] text-gray-500">
                                下注上限 {inv.max_bet ?? '-'}｜筹码步长 {inv.bet_step ?? '-'}
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                try {
                                  playSfx('click');
                                  await joinRoom(inv.join_code, '', 'player');
                                  await setReady();
                                  await refreshInvites();
                                } catch (e) {
                                  alert(e instanceof Error ? e.message : '加入失败');
                                }
                              }}
                              className="shrink-0 bg-gold-500 hover:bg-yellow-400 text-black font-black text-xs px-3 py-2 rounded-xl"
                            >
                              同意进入
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-6">
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-gray-400 mb-2">昵称（系统自动分配）</label>
                    <input 
                      type="text" 
                      value={currentPlayer?.name || ''}
                      readOnly
                      placeholder="进入房间后自动显示：1号、2号..."
                      className="w-full bg-black/30 border border-white/10 rounded-xl py-2.5 md:py-3 px-4 text-gray-300 outline-none transition text-sm"
                    />
                    <div className="mt-1 text-[10px] text-gray-500">按进入房间的先后顺序自动命名，最多到 9999 号</div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                      <h3 className="text-xs font-bold text-gray-400">创建房间</h3>

                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] text-gray-400">房间号（发给其他人加入）</div>
                          <button
                            onClick={() => setCreateJoinCode(makeDefaultJoinCode())}
                            className="text-[10px] px-2 py-1 rounded-full bg-gray-800 border border-white/10 text-gray-200"
                          >
                            换一个
                          </button>
                        </div>
                      <input
                        type="text"
                        value={createJoinCode}
                        onChange={e => setCreateJoinCode(e.target.value.toUpperCase())}
                        placeholder="例如 1000"
                        className="w-full bg-black/50 border border-white/10 rounded-xl py-2 md:py-3 px-4 text-sm"
                      />
                      </div>
                      <input 
                        type="number" 
                        value={maxBet} 
                        onChange={e => setMaxBet(Number(e.target.value))} 
                        placeholder="限额..."
                        className="w-full bg-black/50 border border-white/10 rounded-xl py-2 md:py-3 px-4 text-sm"
                      />

                      <div className="bg-black/20 border border-white/10 rounded-xl p-3 space-y-3">
                        <div className="text-[10px] text-gray-400">下注单位: {betStep}（所有下注金额必须是 {betStep} 的倍数）</div>

                        <div>
                          <div className="text-[10px] text-gray-400 mb-1">头子（含两道/三道/对子道）范围</div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              value={touziMin}
                              onChange={e => setTouziMin(Number(e.target.value))}
                              className="w-full bg-black/50 border border-white/10 rounded-lg py-2 px-3 text-xs"
                              placeholder="最小"
                            />
                            <input
                              type="number"
                              value={touziMax}
                              onChange={e => setTouziMax(Number(e.target.value))}
                              className="w-full bg-black/50 border border-white/10 rounded-lg py-2 px-3 text-xs"
                              placeholder="最大"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] text-gray-400 mb-1">叉注范围</div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              value={chaMin}
                              onChange={e => setChaMin(Number(e.target.value))}
                              className="w-full bg-black/50 border border-white/10 rounded-lg py-2 px-3 text-xs"
                              placeholder="最小"
                            />
                            <input
                              type="number"
                              value={chaMax}
                              onChange={e => setChaMax(Number(e.target.value))}
                              className="w-full bg-black/50 border border-white/10 rounded-lg py-2 px-3 text-xs"
                              placeholder="最大"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <div className="text-[10px] text-gray-400">是否接受赌红</div>
                          <button
                            onClick={() => setAllowHong(v => !v)}
                            className={`px-3 py-1 rounded-full text-[10px] font-bold border transition ${
                              allowHong
                                ? 'bg-green-600 border-green-400 text-white'
                                : 'bg-gray-700 border-gray-600 text-gray-200'
                            }`}
                          >
                            {allowHong ? '接受' : '不接受'}
                          </button>
                        </div>

                        {allowHong && (
                          <div>
                            <div className="text-[10px] text-gray-400 mb-1">赌红范围（庄家全赔时：下注100赢300）</div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                value={hongMin}
                                onChange={e => setHongMin(Number(e.target.value))}
                                className="w-full bg-black/50 border border-white/10 rounded-lg py-2 px-3 text-xs"
                                placeholder="最小"
                              />
                              <input
                                type="number"
                                value={hongMax}
                                onChange={e => setHongMax(Number(e.target.value))}
                                className="w-full bg-black/50 border border-white/10 rounded-lg py-2 px-3 text-xs"
                                placeholder="最大"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <button 
                        onClick={handleCreate}
                        className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-2.5 md:py-3 rounded-xl shadow-lg transition transform active:scale-95 text-sm"
                      >
                        我是庄家
                      </button>
                    </div>
                    
                    <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                      <h3 className="text-xs font-bold text-gray-400">加入房间</h3>
                      <input 
                        type="text" 
                        value={joinCode} 
                        onChange={e => setJoinCode(e.target.value.toUpperCase())} 
                        placeholder="房间码..."
                        className="w-full bg-black/50 border border-white/10 rounded-xl py-2 md:py-3 px-4 text-sm"
                      />
                      <button 
                        onClick={handleJoin}
                        className="w-full bg-gold-500 hover:bg-yellow-400 text-black font-bold py-2.5 md:py-3 rounded-xl shadow-lg transition transform active:scale-95 text-sm"
                      >
                        加入游戏
                      </button>
                    </div>
                  </div>
                </div>
                </div>

                <div>
                  <div className="space-y-4 md:space-y-6">
                    <RoomListPanel onJoin={handleQuickJoin} />
                    <OnlinePlayersPanel />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 md:gap-8">
                <div className="lg:col-span-3 order-1">
                  <GameTable />
                </div>
                
                {/* Mobile Betting Toggle */}
                {currentRound && currentPlayer && (currentPlayer.position === 'chumen' || currentPlayer.position === 'zhongmen' || currentPlayer.position === 'momen') && (
                  <div className="lg:hidden fixed bottom-4 right-4 z-50">
                    <button 
                      onClick={() => setShowBetting(!showBetting)}
                      className="w-14 h-14 bg-gold-500 text-black rounded-full shadow-2xl flex items-center justify-center font-black animate-pulse border-4 border-black"
                    >
                      {showBetting ? '关闭' : '下注'}
                    </button>
                  </div>
                )}

                <div className={`
                  lg:col-span-1 space-y-4 md:space-y-6 order-2
                  ${showBetting ? 'fixed inset-0 z-40 bg-black/95 p-6 overflow-y-auto' : 'hidden lg:block'}
                `}>
                  {showBetting && (
                    <div className="lg:hidden flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold text-gold-500">下注面板</h2>
                      <button onClick={() => setShowBetting(false)} className="text-gray-400 underline text-sm">关闭窗口</button>
                    </div>
                  )}
                  
                  {currentRound && currentPlayer && (currentPlayer.position === 'chumen' || currentPlayer.position === 'zhongmen' || currentPlayer.position === 'momen') && (
                    <BettingPanel 
                      roundId={currentRound.id} 
                      playerId={currentPlayer.id} 
                      maxBet={room.max_bet} 
                      betStep={room.bet_step}
                      touziMinBet={room.touzi_min_bet}
                      touziMaxBet={room.touzi_max_bet}
                      chaMinBet={room.cha_min_bet}
                      chaMaxBet={room.cha_max_bet}
                      allowHong={room.allow_hong}
                      hongMinBet={room.hong_min_bet}
                      hongMaxBet={room.hong_max_bet}
                      disabled={!!startPos || (!!currentRound.phase && currentRound.phase !== 'betting')}
                      disabledReason={
                        currentRound.phase === 'dice_done'
                          ? '庄家已掷骰，等待发牌'
                          : currentRound.phase === 'dealing'
                            ? '正在发牌，暂不可下注'
                            : currentRound.phase === 'wait_reveal'
                              ? '发牌完成，等待庄家开牌'
                              : currentRound.phase === 'revealing'
                                ? '庄家正在开牌，暂不可下注'
                                : currentRound.phase === 'settling' || currentRound.phase === 'settled'
                                  ? '本轮已结算，暂不可下注'
                                  : '下注已关闭'
                      }
                      requiredPosition={currentPlayer.position}
                      requiredDone={currentPlayer.position ? betStatus[currentPlayer.position] : true}
                    />
                  )}
                  
                  <div className="bg-gray-900/50 p-4 rounded-xl border border-white/10 text-[10px] md:text-xs text-gray-400 space-y-2">
                    <p className="font-bold text-gray-200">当前角色信息</p>
                    <p>姓名: {currentPlayer?.name}</p>
                    <p>角色: {currentPlayer?.role === 'banker' ? '庄家' : '闲家'}</p>
                    <p>位置: {positionLabel(currentPlayer?.position)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'record' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <RecordMode />
          </div>
        )}

        {mode === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <HistoryAnalysis />
          </div>
        )}

        {mode === 'admin' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <AdminPanel />
          </div>
        )}
      </main>
      
      <footer className="max-w-7xl mx-auto mt-12 pt-8 border-t border-white/5 text-center text-gray-600 text-xs">
        <p>© 2026 麻将推对子游戏平台 - 祝您玩得愉快</p>
      </footer>

      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      <AudioSettingsModal />
    </div>
  );
};

export default App;
