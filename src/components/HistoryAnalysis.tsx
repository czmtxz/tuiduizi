import React, { useEffect, useState } from 'react';
import { supabase, type Database } from '../lib/supabase';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';

const HistoryAnalysis: React.FC = () => {
  type GameRecordRow = Database['public']['Tables']['game_records']['Row'];
  const [records, setRecords] = useState<GameRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [view, setView] = useState<'auto' | 'today'>('auto');

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setAuthUserId(data.session?.user.id || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user.id || null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const fetchRecords = async () => {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 0, 0, 0, 0);

      const isAuthed = !!authUserId;
      const effectiveView = view === 'auto' ? (isAuthed ? 'all' : 'today') : 'today';

      let q = supabase.from('game_records').select('*');
      if (isAuthed) {
        q = q.eq('user_id', authUserId);
        if (effectiveView === 'today') q = q.gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
      } else {
        q = q.is('user_id', null).gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
      }

      const { data } = await q.order('created_at', { ascending: true });
      
      if (data) setRecords(data);
      setLoading(false);
    };

    fetchRecords();
  }, [authUserId, view]);

  if (loading) return <div className="text-center py-20">加载中...</div>;

  const showTodayOnly = !authUserId || view === 'today';

  const asObject = (v: unknown): Record<string, unknown> | null => {
    if (!v || typeof v !== 'object') return null;
    if (Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  };

  const readNumber = (v: unknown): number => (typeof v === 'number' ? v : 0);

  const readProfitLoss = (v: unknown): Record<string, number> => {
    const o = asObject(v);
    if (!o) return {};
    const out: Record<string, number> = {};
    for (const [k, val] of Object.entries(o)) {
      if (typeof val === 'number') out[k] = val;
    }
    return out;
  };

  const readSummary = (v: unknown): Record<string, unknown> | null => {
    const o = asObject(v);
    if (!o) return null;
    const s = asObject(o.summary);
    return s;
  };

  const readOutcomeLabel = (profitLoss: unknown): string => {
    const s = readSummary(profitLoss);
    if (s && typeof s.label === 'string') return s.label;
    const pl = readProfitLoss(profitLoss);
    const banker = pl.banker || 0;
    if (banker === 3) return '赢3';
    if (banker === -3) return '赔3';
    if (banker === 1) return '赔1赢2';
    if (banker === -1) return '赔2赢1';
    return `净${banker}`;
  };

  const readRoundIndex = (profitLoss: unknown): number | null => {
    const s = readSummary(profitLoss);
    const v = s?.roundIndex;
    return typeof v === 'number' ? v : null;
  };

  const readPoints = (dist: unknown, pos: string): number => {
    const root = asObject(dist);
    if (!root) return 0;
    const seat = asObject(root[pos]);
    if (!seat) return 0;
    return readNumber(seat.points);
  };

  const readIsPair = (dist: unknown, pos: string): boolean => {
    const root = asObject(dist);
    if (!root) return false;
    const seat = asObject(root[pos]);
    if (!seat) return false;
    return seat.isPair === true;
  };


  // 1. Trend Data (Banker Profit/Loss over time)
  let cumulativePL = 0;
  const trendData = records.map((rec, i) => {
    const pl = readProfitLoss(rec.profit_loss);
    cumulativePL += pl.banker || 0;
    return {
      name: `第${i + 1}局`,
      pl: pl.banker || 0,
      cumulative: cumulativePL
    };
  });

  // 2. Radar Data (Average points and win rates per position)
  const posStats = {
    chumen: { points: 0, wins: 0, total: 0 },
    zhongmen: { points: 0, wins: 0, total: 0 },
    momen: { points: 0, wins: 0, total: 0 },
    banker: { points: 0, wins: 0, total: 0 },
  };

  records.forEach(rec => {
    const dist = rec.card_distribution;
    const pl = readProfitLoss(rec.profit_loss);
    Object.keys(posStats).forEach(pos => {
      const points = readPoints(dist, pos);
      if (points > 0) {
        posStats[pos as keyof typeof posStats].points += points;
        posStats[pos as keyof typeof posStats].total += 1;
        if (pos === 'banker') {
          if (pl.banker > 0) posStats.banker.wins += 1;
        } else {
          if (pl[pos] > 0) posStats[pos as keyof typeof posStats].wins += 1;
        }
      }
    });
  });

  const radarData = Object.keys(posStats).map(pos => ({
    subject: pos === 'banker' ? '庄家' : pos === 'chumen' ? '出门' : pos === 'zhongmen' ? '中门' : '末门',
    A: (posStats[pos as keyof typeof posStats].wins / (posStats[pos as keyof typeof posStats].total || 1)) * 100,
    B: (posStats[pos as keyof typeof posStats].points / (posStats[pos as keyof typeof posStats].total || 1)) * 10,
    fullMark: 100,
  }));

  // 3. Overall Stats
  const totalGames = records.length;
  const bankerWins = records.filter(r => (readProfitLoss(r.profit_loss).banker || 0) > 0).length;
  const bankerLosses = records.filter(r => (readProfitLoss(r.profit_loss).banker || 0) < 0).length;
  const totalPL = records.reduce((sum, r) => sum + (readProfitLoss(r.profit_loss).banker || 0), 0);

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in duration-700 pb-20 p-2 md:p-0">
      <h2 className="text-2xl md:text-3xl font-black text-center text-gold-500 italic tracking-widest">数据分析与战绩统计</h2>

      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] md:text-xs text-gray-400">
          {authUserId ? '已登录：显示自己的战绩' : '游客：仅展示当天战绩'}
        </div>
        {authUserId && (
          <div className="flex gap-2">
            <button
              onClick={() => setView('auto')}
              className={`text-[10px] md:text-xs font-bold px-3 py-1.5 rounded-full border ${
                view === 'auto' ? 'bg-gold-500 text-black border-gold-500' : 'bg-black/30 text-gray-200 border-white/10'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setView('today')}
              className={`text-[10px] md:text-xs font-bold px-3 py-1.5 rounded-full border ${
                view === 'today' ? 'bg-gold-500 text-black border-gold-500' : 'bg-black/30 text-gray-200 border-white/10'
              }`}
            >
              仅今日
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        {[
          { label: '总局数', value: totalGames, color: 'text-white' },
          { label: '庄胜率', value: `${((bankerWins / (totalGames || 1)) * 100).toFixed(1)}%`, color: 'text-green-500' },
          { label: '庄败率', value: `${((bankerLosses / (totalGames || 1)) * 100).toFixed(1)}%`, color: 'text-red-500' },
          { label: '盈亏', value: totalPL > 0 ? `+${totalPL}` : totalPL, color: totalPL >= 0 ? 'text-yellow-500' : 'text-red-500' },
        ].map((stat, i) => (
          <div key={i} className="bg-gray-900/50 p-3 md:p-6 rounded-2xl border border-white/5 backdrop-blur-sm text-center">
            <div className="text-[10px] md:text-xs text-gray-500 uppercase tracking-tighter mb-1">{stat.label}</div>
            <div className={`text-lg md:text-2xl font-black ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
        {/* Trend Chart */}
        <div className="bg-gray-900/50 p-4 md:p-6 rounded-3xl border border-white/5 backdrop-blur-sm">
          <h3 className="text-xs md:text-sm font-bold text-gray-400 mb-4 md:mb-6 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> 庄家盈亏趋势
          </h3>
          <div className="h-[200px] md:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#666" fontSize={8} />
                <YAxis stroke="#666" fontSize={8} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: 'none', borderRadius: '8px', fontSize: '10px' }}
                  itemStyle={{ color: '#d4af37' }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="cumulative" name="累计盈亏" stroke="#d4af37" strokeWidth={2} dot={{ fill: '#d4af37', r: 2 }} />
                <Line type="monotone" dataKey="pl" name="单局" stroke="#3b82f6" strokeWidth={1} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radar Chart */}
        <div className="bg-gray-900/50 p-4 md:p-6 rounded-3xl border border-white/5 backdrop-blur-sm">
          <h3 className="text-xs md:text-sm font-bold text-gray-400 mb-4 md:mb-6 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-purple-500 rounded-full" /> 综合表现
          </h3>
          <div className="h-[200px] md:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="60%" data={radarData}>
                <PolarGrid stroke="#333" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#999', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                <Radar name="胜率" dataKey="A" stroke="#d4af37" fill="#d4af37" fillOpacity={0.6} />
                <Radar name="均点" dataKey="B" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '10px' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-gray-900/50 rounded-3xl border border-white/5 backdrop-blur-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-white/5">
          <h3 className="text-sm md:text-base font-bold text-gray-300">详细记录{showTodayOnly ? '（仅今日）' : ''}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/20 text-gray-400 uppercase text-[10px] md:text-[13px] tracking-widest">
              <tr>
                <th className="px-3 md:px-6 py-3 md:py-4 font-medium">#</th>
                <th className="px-3 md:px-6 py-3 md:py-4 font-medium">轮</th>
                <th className="px-3 md:px-6 py-3 md:py-4 font-medium">庄</th>
                <th className="px-3 md:px-6 py-3 md:py-4 font-medium">出</th>
                <th className="px-3 md:px-6 py-3 md:py-4 font-medium">中</th>
                <th className="px-3 md:px-6 py-3 md:py-4 font-medium">末</th>
                <th className="px-3 md:px-6 py-3 md:py-4 font-medium">走势</th>
                <th className="px-3 md:px-6 py-3 md:py-4 font-medium text-right">盈亏</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 md:px-6 py-10 text-center text-gray-400">
                    暂无记录
                  </td>
                </tr>
              ) : (
                records.slice().reverse().map((rec, i) => (
                <tr key={i} className="hover:bg-white/5 transition">
                  {(() => {
                    const dist = rec.card_distribution;
                    const pl = readProfitLoss(rec.profit_loss);
                    const bankerPoints = readPoints(dist, 'banker');
                    const bankerIsPair = readIsPair(dist, 'banker');
                    const bankerPL = pl.banker || 0;
                    const outcome = readOutcomeLabel(rec.profit_loss);
                    const rIndex = readRoundIndex(rec.profit_loss);
                    return (
                      <>
                  <td className="px-3 md:px-6 py-3 md:py-4 text-gray-400 text-[13px]">#{records.length - i}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4 font-mono text-yellow-500">{rIndex ?? records.length - i}</td>
                  <td className="px-3 md:px-6 py-3 md:py-4">
                    <span className={`px-2 py-1 rounded text-[10px] md:text-sm ${bankerIsPair ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-200'}`}>
                      {bankerPoints}
                    </span>
                  </td>
                  {['chumen', 'zhongmen', 'momen'].map(pos => (
                    <td key={pos} className="px-3 md:px-6 py-3 md:py-4">
                      <div className="flex flex-col">
                        <span className="text-[13px] text-gray-100">{readPoints(dist, pos)}</span>
                        <span className={`text-[10px] font-bold ${(pl[pos] || 0) < 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {(pl[pos] || 0) > 0 ? '输' : '赢'}
                        </span>
                      </div>
                    </td>
                  ))}
                  <td className="px-3 md:px-6 py-3 md:py-4">
                    <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[13px] text-gray-100 whitespace-nowrap">
                      {outcome}
                    </span>
                  </td>
                  <td className={`px-3 md:px-6 py-3 md:py-4 text-right font-black text-[13px] md:text-base ${bankerPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {bankerPL > 0 ? `+${bankerPL}` : bankerPL}
                  </td>
                      </>
                    );
                  })()}
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HistoryAnalysis;
