import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { positionLabel, roleLabel } from '../utils/labels';

type PlayerListRow = {
  id: string;
  name: string;
  role: 'banker' | 'player';
  position: 'banker' | 'chumen' | 'zhongmen' | 'momen' | null;
  updated_at: string;
  is_active: boolean;
  room?: { join_code: string } | null;
};

const isOnline = (updatedAt: string, thresholdMs: number) => {
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= thresholdMs;
};

const OnlinePlayersPanel: React.FC = () => {
  const [rows, setRows] = useState<PlayerListRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlayers = async () => {
    const { data } = await supabase
      .from('players')
      .select('id, name, role, position, updated_at, is_active, room:rooms!players_room_id_fkey(join_code)')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(200);
    setRows((data || []) as unknown as PlayerListRow[]);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPlayers().catch(() => void 0);
    const id = window.setInterval(() => {
      if (!alive) return;
      fetchPlayers().catch(() => void 0);
    }, 2500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const thresholdMs = 25_000;
  const onlineRows = useMemo(() => rows.filter(r => isOnline(r.updated_at, thresholdMs)), [rows]);

  return (
    <div className="bg-gray-900/60 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden">
      <div className="p-4 md:p-6 border-b border-white/5 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm md:text-base font-black text-gray-100">在线人员</div>
          <div className="text-[10px] md:text-xs text-gray-400">心跳阈值 {Math.round(thresholdMs / 1000)} 秒</div>
        </div>
        <div className="text-xs font-black text-gold-500">{onlineRows.length}</div>
      </div>

      <div className="p-4 md:p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[10px] md:text-xs text-gray-400 uppercase tracking-widest">
              <tr className="border-b border-white/5">
                <th className="py-3 px-2">昵称</th>
                <th className="py-3 px-2">房间</th>
                <th className="py-3 px-2">位置</th>
                <th className="py-3 px-2">角色</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-gray-400 text-sm">加载中...</td>
                </tr>
              ) : onlineRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-gray-400 text-sm">暂无在线人员</td>
                </tr>
              ) : (
                onlineRows.slice(0, 80).map(p => (
                  <tr key={p.id} className="hover:bg-white/5 transition">
                    <td className="py-3 px-2 text-gray-100">{p.name}</td>
                    <td className="py-3 px-2 font-mono text-gold-500">{p.room?.join_code ?? '-'}</td>
                    <td className="py-3 px-2 text-gray-200">{positionLabel(p.position)}</td>
                    <td className="py-3 px-2 text-gray-200">{roleLabel(p.role)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {onlineRows.length > 80 && (
          <div className="mt-2 text-[10px] text-gray-500">仅展示前 80 条</div>
        )}
      </div>
    </div>
  );
};

export default OnlinePlayersPanel;
