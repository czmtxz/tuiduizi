import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAudio } from '../audio/audioStore';

type RoomStatus = 'waiting' | 'playing' | 'finished';

type RoomListRow = {
  id: string;
  join_code: string;
  status: RoomStatus;
  created_at: string;
  updated_at?: string;
  players?: { count: number }[];
};

type RoomListItem = {
  id: string;
  joinCode: string;
  status: RoomStatus;
  createdAt: string;
  playerCount: number;
  maxPlayers: number;
};

export interface RoomListPanelProps {
  onJoin: (joinCode: string) => void;
}

const statusLabel = (s: RoomStatus) => {
  if (s === 'waiting') return '等人';
  if (s === 'playing') return '进行中';
  return '已结束';
};

const statusBadgeClass = (s: RoomStatus) => {
  if (s === 'waiting') return 'bg-green-500/15 text-green-300 border-green-500/20';
  if (s === 'playing') return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
  return 'bg-gray-500/15 text-gray-300 border-gray-500/20';
};

const RoomListPanel: React.FC<RoomListPanelProps> = ({ onJoin }) => {
  const [filter, setFilter] = useState<'all' | 'joinable'>('joinable');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const playSfx = useAudio(s => s.playSfx);

  const fetchRooms = async () => {
    setError(null);
    try {
      await supabase.rpc('cleanup_inactive_rooms');
    } catch {
      void 0;
    }
    const { data, error: e } = await supabase
      .from('rooms')
      .select('id, join_code, status, created_at, updated_at, players:players!players_room_id_fkey(count)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (e) {
      setError(e.message || '加载失败');
      return;
    }
    const maxPlayers = 4;
    const next = ((data || []) as unknown as RoomListRow[]).map(r => ({
      id: r.id,
      joinCode: r.join_code,
      status: r.status,
      createdAt: r.created_at,
      playerCount: r.players?.[0]?.count ?? 0,
      maxPlayers,
    }));
    setRooms(next);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchRooms()
      .catch(() => {
        if (!alive) return;
        setError('加载失败');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    const id = window.setInterval(() => {
      fetchRooms().catch(() => void 0);
    }, 2500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const viewRooms = useMemo(() => {
    if (filter === 'all') return rooms;
    return rooms.filter(r => r.playerCount < r.maxPlayers && r.status !== 'finished');
  }, [rooms, filter]);

  return (
    <div className="bg-gray-900/60 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden">
      <div className="p-4 md:p-6 border-b border-white/5 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm md:text-base font-black text-gray-100">多人联机大厅</div>
          <div className="text-[10px] md:text-xs text-gray-400">实时房间列表（每2.5秒刷新）</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              playSfx('click');
              setFilter('joinable');
            }}
            className={`text-[10px] md:text-xs font-bold px-3 py-1.5 rounded-full border transition ${
              filter === 'joinable'
                ? 'bg-gold-500 text-black border-gold-500'
                : 'bg-black/30 text-gray-200 border-white/10 hover:bg-white/5'
            }`}
          >
            可加入
          </button>
          <button
            onClick={() => {
              playSfx('click');
              setFilter('all');
            }}
            className={`text-[10px] md:text-xs font-bold px-3 py-1.5 rounded-full border transition ${
              filter === 'all'
                ? 'bg-gold-500 text-black border-gold-500'
                : 'bg-black/30 text-gray-200 border-white/10 hover:bg-white/5'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => {
              playSfx('click');
              fetchRooms().catch(() => void 0);
            }}
            className="text-[10px] md:text-xs font-bold px-3 py-1.5 rounded-full bg-black/30 text-gray-200 border border-white/10 hover:bg-white/5 transition"
          >
            刷新
          </button>
        </div>
      </div>

      <div className="p-4 md:p-6">
        {error && (
          <div className="mb-3 text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[10px] md:text-xs text-gray-400 uppercase tracking-widest">
              <tr className="border-b border-white/5">
                <th className="py-3 px-2">房间号</th>
                <th className="py-3 px-2">人数</th>
                <th className="py-3 px-2">状态</th>
                <th className="py-3 px-2">已开局</th>
                <th className="py-3 px-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-400 text-sm">
                    加载中...
                  </td>
                </tr>
              ) : viewRooms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-400 text-sm">
                    暂无可加入房间
                  </td>
                </tr>
              ) : (
                viewRooms.map(r => {
                  const canJoin = r.playerCount < r.maxPlayers && r.status !== 'finished';
                  const started = r.status === 'playing' || r.status === 'finished';
                  return (
                    <tr key={r.id} className="hover:bg-white/5 transition">
                      <td className="py-3 px-2 font-mono text-gold-500">{r.joinCode}</td>
                      <td className="py-3 px-2 text-gray-200">
                        {r.playerCount}/{r.maxPlayers}
                      </td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full border text-[10px] md:text-xs ${statusBadgeClass(r.status)}`}>
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full border text-[10px] md:text-xs ${
                          started ? 'bg-amber-500/15 text-amber-300 border-amber-500/20' : 'bg-green-500/15 text-green-300 border-green-500/20'
                        }`}>
                          {started ? '是' : '否'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <button
                          disabled={!canJoin}
                          onClick={() => {
                            playSfx('click');
                            onJoin(r.joinCode);
                          }}
                          className={`text-xs md:text-sm font-black px-3 py-2 rounded-xl transition ${
                            canJoin
                              ? 'bg-gold-500 hover:bg-yellow-400 text-black shadow-lg shadow-gold-500/20'
                              : 'bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed'
                          }`}
                        >
                          加入
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RoomListPanel;
