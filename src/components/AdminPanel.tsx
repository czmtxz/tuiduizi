import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { positionLabel } from '../utils/labels';
import { buildVoiceReportStats, filterVoiceReports, getVoiceReportStatusLabel, type VoiceReportFilter } from '../voice/reportAdmin';

type RoomStatus = 'waiting' | 'playing' | 'finished';

const SUPER_ADMIN_EMAIL = '89348464@qq.com';

type RoomListRow = {
  id: string;
  join_code: string;
  status: RoomStatus;
  created_at: string;
  updated_at?: string;
  ai_enabled?: boolean;
  players?: { count: number }[];
};

type RoomItem = {
  id: string;
  joinCode: string;
  status: RoomStatus;
  createdAt: string;
  playerCount: number;
  aiEnabled: boolean;
};

type PlayerRow = {
  id: string;
  room_id: string;
  name: string;
  role: 'banker' | 'player';
  position: 'banker' | 'chumen' | 'zhongmen' | 'momen' | null;
  is_ready: boolean;
  is_active: boolean;
  updated_at: string;
};

type VoiceReportRow = {
  id: string;
  room_id: string;
  reporter_player_id: string;
  target_player_id: string;
  rtc_session_id: string | null;
  reason: string;
  status: 'open' | 'reviewed' | 'resolved' | 'rejected';
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type VoicePenaltyRow = {
  id: string;
  room_id: string;
  target_player_id: string;
  report_id: string | null;
  action_type: 'mute';
  reason: string;
  created_by: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type VoiceProviderSetting = 'auto' | 'agora' | 'livekit' | 'browser';

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

const AdminPanel: React.FC = () => {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [voiceReports, setVoiceReports] = useState<VoiceReportRow[]>([]);
  const [voiceReportsLoading, setVoiceReportsLoading] = useState(false);
  const [voiceReportFilter, setVoiceReportFilter] = useState<VoiceReportFilter>('all');
  const [voicePenalties, setVoicePenalties] = useState<VoicePenaltyRow[]>([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const selectAllRef = React.useRef<HTMLInputElement | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [grantEmail, setGrantEmail] = useState('');

  const [allowGuest, setAllowGuest] = useState<boolean | null>(null);
  const [allowGuestLoading, setAllowGuestLoading] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState<VoiceProviderSetting>('auto');
  const [voiceProviderLoading, setVoiceProviderLoading] = useState(false);

  const fetchRooms = async () => {
    setError(null);
    const { data, error: e } = await supabase
      .from('rooms')
      .select('id, join_code, status, created_at, updated_at, ai_enabled, players:players!players_room_id_fkey(count)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (e) {
      setError(e.message || '加载失败');
      return;
    }

    const next = ((data || []) as unknown as RoomListRow[]).map(r => ({
      id: r.id,
      joinCode: r.join_code,
      status: r.status,
      createdAt: r.created_at,
      playerCount: r.players?.[0]?.count ?? 0,
      aiEnabled: !!r.ai_enabled,
    }));
    setRooms(next);
  };

  const refreshAdminStatus = useCallback(async (email: string | null) => {
    if (!email) {
      setIsAdmin(false);
      return;
    }
    if (email === SUPER_ADMIN_EMAIL) {
      setIsAdmin(true);
      return;
    }
    const { data, error: e } = await supabase.from('admin_emails').select('email').eq('email', email).maybeSingle();
    if (e) {
      setIsAdmin(false);
      return;
    }
    setIsAdmin(!!data);
  }, []);

  const refreshAdminList = useCallback(async (email: string | null) => {
    if (email !== SUPER_ADMIN_EMAIL) {
      setAdminEmails([]);
      return;
    }
    if (sessionEmail !== SUPER_ADMIN_EMAIL) return;
    const { data, error: e } = await supabase.from('admin_emails').select('email').order('created_at', { ascending: false });
    if (e) return;
    setAdminEmails((data || []).map(x => x.email));
  }, [sessionEmail]);

  const fetchPlayers = async (roomId: string) => {
    setPlayersLoading(true);
    const { data, error: e } = await supabase
      .from('players')
      .select('id, room_id, name, role, position, is_ready, is_active, updated_at')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });
    if (e) {
      setError(e.message || '加载失败');
      setPlayers([]);
    } else {
      setPlayers(((data || []) as unknown as PlayerRow[]).filter(p => p.is_active !== false));
    }
    setPlayersLoading(false);
  };

  const fetchVoiceReports = async (roomId: string) => {
    setVoiceReportsLoading(true);
    const { data, error: e } = await supabase
      .from('voice_reports')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (e) {
      setError(e.message || '加载语音举报失败');
      setVoiceReports([]);
    } else {
      setVoiceReports((data || []) as VoiceReportRow[]);
    }
    setVoiceReportsLoading(false);
  };

  const fetchVoicePenalties = async (roomId: string) => {
    const { data, error: e } = await supabase
      .from('voice_penalties')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (e) {
      setError(e.message || '加载语音处罚失败');
      setVoicePenalties([]);
    } else {
      setVoicePenalties((data || []) as VoicePenaltyRow[]);
    }
  };

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const email = data.session?.user.email || null;
      setSessionEmail(email);
      refreshAdminStatus(email);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email || null;
      setSessionEmail(email);
      refreshAdminStatus(email);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshAdminStatus]);

  useEffect(() => {
    if (!isAdmin) {
      setAllowGuest(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setAllowGuestLoading(true);
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('allow_guest, voice_provider')
          .eq('id', 1)
          .maybeSingle();
        if (!cancelled) {
          setAllowGuest(data?.allow_guest ?? true);
          setVoiceProvider((data?.voice_provider as VoiceProviderSetting | undefined) || 'auto');
        }
      } finally {
        if (!cancelled) {
          setAllowGuestLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const updateAllowGuest = async (next: boolean) => {
    setAllowGuestLoading(true);
    try {
      const { error: e } = await supabase
        .from('app_settings')
        .update({ allow_guest: next, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (e) throw e;
      setAllowGuest(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失败');
    } finally {
      setAllowGuestLoading(false);
    }
  };

  const updateVoiceProvider = async (next: VoiceProviderSetting) => {
    setVoiceProviderLoading(true);
    try {
      const { error: e } = await supabase
        .from('app_settings')
        .update({ voice_provider: next, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (e) throw e;
      setVoiceProvider(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失败');
    } finally {
      setVoiceProviderLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionEmail || !isAdmin) return;
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
      if (selectedRoomId) {
        fetchPlayers(selectedRoomId).catch(() => void 0);
        fetchVoiceReports(selectedRoomId).catch(() => void 0);
        fetchVoicePenalties(selectedRoomId).catch(() => void 0);
      }
    }, 2500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [sessionEmail, selectedRoomId, isAdmin]);

  const selectedRoom = useMemo(() => rooms.find(r => r.id === selectedRoomId) || null, [rooms, selectedRoomId]);
  const voiceReportStats = useMemo(() => buildVoiceReportStats(voiceReports), [voiceReports]);
  const filteredVoiceReports = useMemo(() => filterVoiceReports(voiceReports, voiceReportFilter), [voiceReports, voiceReportFilter]);

  const allSelected = useMemo(() => rooms.length > 0 && rooms.every(r => selectedRoomIds.has(r.id)), [rooms, selectedRoomIds]);
  const someSelected = useMemo(() => rooms.some(r => selectedRoomIds.has(r.id)) && !allSelected, [rooms, selectedRoomIds, allSelected]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  useEffect(() => {
    refreshAdminList(sessionEmail);
  }, [sessionEmail, refreshAdminList]);

  if (!sessionEmail) {
    return (
      <div className="max-w-xl mx-auto bg-gray-900/60 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl p-6">
        <div className="text-xl font-black text-gold-500">管理员模式</div>
        <div className="mt-2 text-xs text-gray-400">仅供内部管理使用：批量解散房间、踢出玩家、观战查看。</div>
        <div className="mt-4 flex gap-2">
          <input
            value={adminEmail}
            onChange={e => setAdminEmail(e.target.value)}
            placeholder="管理员账号（邮箱）"
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm"
          />
          <input
            value={adminPassword}
            onChange={e => setAdminPassword(e.target.value)}
            placeholder="管理员密码"
            type="password"
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm"
          />
          <button
            disabled={authLoading}
            onClick={async () => {
              const e = adminEmail.trim();
              if (!e || !adminPassword) return alert('请输入账号和密码');
              setAuthLoading(true);
              try {
                const { error: signInError } = await supabase.auth.signInWithPassword({ email: e, password: adminPassword });
                if (signInError) throw signInError;
              } catch (err) {
                alert(err instanceof Error ? err.message : '登录失败');
              } finally {
                setAuthLoading(false);
              }
            }}
            className="bg-gold-500 hover:bg-yellow-400 text-black font-black px-4 py-2 rounded-xl"
          >
            登录
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto bg-gray-900/60 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl p-6">
        <div className="text-xl font-black text-gold-500">管理员模式</div>
        <div className="mt-2 text-xs text-gray-400">当前账号：{sessionEmail}</div>
        <div className="mt-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          无管理员权限，请联系超级管理员 {SUPER_ADMIN_EMAIL} 授权
        </div>
        <div className="mt-4">
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-gray-800 border border-white/10 text-gray-200 hover:bg-gray-700"
          >
            退出登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-2xl font-black text-gold-500">管理员大厅</div>
          <div className="text-[10px] text-gray-400">房间列表/玩家管理（每2.5秒刷新）</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRooms().catch(() => void 0)}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-black/30 text-gray-200 border border-white/10 hover:bg-white/5"
          >
            刷新
          </button>
          <button
            onClick={() => {
              supabase.auth.signOut();
            }}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-gray-800 text-gray-200 border border-white/10 hover:bg-gray-700"
          >
            退出
          </button>
        </div>
      </div>

      {sessionEmail === SUPER_ADMIN_EMAIL && (
        <div className="bg-gray-900/60 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <div className="font-black text-gray-100">超级管理员：管理员授权</div>
              <div className="text-[10px] text-gray-400">为其他注册用户授予/移除管理员权限（按邮箱）</div>
            </div>
            <button
              onClick={() => refreshAdminList(sessionEmail)}
              className="text-[10px] font-bold px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-gray-200 hover:bg-white/5"
            >
              刷新
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <input
                value={grantEmail}
                onChange={e => setGrantEmail(e.target.value)}
                placeholder="输入要授权的邮箱"
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm"
              />
              <button
                onClick={async () => {
                  const e = grantEmail.trim();
                  if (!e) return;
                  const { error: ie } = await supabase.from('admin_emails').insert({ email: e });
                  if (ie) return alert(ie.message);
                  setGrantEmail('');
                  await refreshAdminList(sessionEmail);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-2 rounded-xl"
              >
                授权
              </button>
            </div>

            {adminEmails.length === 0 ? (
              <div className="text-xs text-gray-400">暂无其他管理员</div>
            ) : (
              <div className="space-y-2">
                {adminEmails.map(e => (
                  <div key={e} className="flex items-center justify-between gap-2 bg-black/30 border border-white/10 rounded-2xl px-3 py-2">
                    <div className="text-sm text-gray-100 truncate">{e}</div>
                    <button
                      onClick={async () => {
                        if (!confirm(`确认移除管理员：${e}？`)) return;
                        const { error: de } = await supabase.from('admin_emails').delete().eq('email', e);
                        if (de) return alert(de.message);
                        await refreshAdminList(sessionEmail);
                      }}
                      className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-700 hover:bg-red-600 text-white"
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="bg-gray-900/60 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <div className="font-black text-gray-100">系统设置</div>
            <div className="text-[10px] text-gray-400">控制游客模式与全局语音平台</div>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-200">允许游客直接玩</div>
              <button
                disabled={allowGuestLoading || allowGuest === null}
                onClick={() => updateAllowGuest(!(allowGuest ?? true))}
                className={`text-xs font-bold px-3 py-2 rounded-xl border transition ${
                  allowGuest
                    ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500/30 text-white'
                    : 'bg-gray-800 hover:bg-gray-700 border-white/10 text-gray-200'
                } ${allowGuestLoading || allowGuest === null ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {allowGuestLoading ? '更新中…' : allowGuest ? '已开启' : '已关闭'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-gray-200">语音平台</div>
                <div className="text-[10px] text-gray-500">auto 按环境自动优先选择 LiveKit / Agora / 本地测试，避免不同页面走到不同语音后端</div>
              </div>
              <select
                value={voiceProvider}
                disabled={voiceProviderLoading}
                onChange={e => updateVoiceProvider(e.target.value as VoiceProviderSetting)}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100"
              >
                <option value="auto">auto（自动）</option>
                <option value="agora">Agora</option>
                <option value="livekit">LiveKit</option>
                <option value="browser">Browser Stub</option>
              </select>
            </div>
          </div>
          <div className="px-4 pb-4 text-[10px] text-gray-400">
            提示：开启游客模式仍需 Supabase 后台启用 Anonymous sign-ins。
          </div>
        </div>
      )}

      {error && (
        <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900/60 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <div className="font-black text-gray-100">房间列表</div>
            <div className="text-[10px] text-gray-500">共 {rooms.length} 个</div>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <button
                onClick={async () => {
                  if (selectedRoomIds.size === 0) return alert('请先勾选房间');
                  if (!confirm(`确认解散选中的 ${selectedRoomIds.size} 个房间？`)) return;
                  const ids = Array.from(selectedRoomIds);
                  const { error: e } = await supabase.from('rooms').delete().in('id', ids);
                  if (e) return alert(e.message);
                  setSelectedRoomIds(new Set());
                  setSelectedRoomId(null);
                  setPlayers([]);
                  await fetchRooms();
                }}
                className="text-[10px] font-bold px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white"
              >
                批量解散
              </button>
              <div className="text-[10px] text-gray-500">已选 {selectedRoomIds.size} 个</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[10px] text-gray-400 uppercase tracking-widest">
                  <tr className="border-b border-white/5">
                    <th className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allSelected}
                          onChange={e => {
                            const checked = e.target.checked;
                            setSelectedRoomIds(() => {
                              if (!checked) return new Set();
                              return new Set(rooms.map(r => r.id));
                            });
                          }}
                        />
                        <span>全选</span>
                      </div>
                    </th>
                    <th className="py-2 px-2">房间号</th>
                    <th className="py-2 px-2">人数</th>
                    <th className="py-2 px-2">状态</th>
                    <th className="py-2 px-2">AI</th>
                    <th className="py-2 px-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-400 text-sm">加载中...</td>
                    </tr>
                  ) : rooms.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-400 text-sm">暂无房间</td>
                    </tr>
                  ) : (
                    rooms.map(r => (
                      <tr
                        key={r.id}
                        className={`transition hover:bg-white/5 ${selectedRoomId === r.id ? 'bg-white/5' : ''}`}
                      >
                        <td className="py-2 px-2">
                          <input
                            type="checkbox"
                            checked={selectedRoomIds.has(r.id)}
                            onChange={e => {
                              setSelectedRoomIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(r.id);
                                else next.delete(r.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="py-2 px-2 font-mono text-gold-500">{r.joinCode}</td>
                        <td className="py-2 px-2 text-gray-200">{r.playerCount}/4</td>
                        <td className="py-2 px-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full border text-[10px] ${statusBadgeClass(r.status)}`}>
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full border text-[10px] ${
                            r.aiEnabled ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' : 'bg-gray-500/15 text-gray-300 border-gray-500/20'
                          }`}>
                            {r.aiEnabled ? '开' : '关'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <button
                            onClick={async () => {
                              setSelectedRoomId(r.id);
                              setVoiceReportFilter('all');
                              await fetchPlayers(r.id);
                              await fetchVoiceReports(r.id);
                              await fetchVoicePenalties(r.id);
                            }}
                            className="text-[10px] font-bold px-2 py-1 rounded-full bg-black/30 border border-white/10 hover:bg-white/5"
                          >
                            查看
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-gray-900/60 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between gap-2">
            <div className="font-black text-gray-100">房间管理</div>
            {selectedRoom && (
              <div className="text-[10px] text-gray-400">房间号 {selectedRoom.joinCode}</div>
            )}
          </div>
          <div className="p-4">
            {!selectedRoom ? (
              <div className="py-10 text-center text-gray-400 text-sm">请选择一个房间查看详情</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-xs text-gray-300">
                    状态：<span className="text-yellow-400 font-bold">{statusLabel(selectedRoom.status)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!confirm('确认解散该房间？')) return;
                        const { error: e } = await supabase.from('rooms').delete().eq('id', selectedRoom.id);
                        if (e) return alert(e.message);
                        setSelectedRoomId(null);
                        setPlayers([]);
                        setVoiceReports([]);
                        setVoicePenalties([]);
                        setVoiceReportFilter('all');
                        await fetchRooms();
                      }}
                      className="text-xs font-bold px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-white"
                    >
                      解散房间
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-gray-400 mb-2">玩家列表</div>
                {playersLoading ? (
                  <div className="py-10 text-center text-gray-400 text-sm">加载中...</div>
                ) : players.length === 0 ? (
                  <div className="py-10 text-center text-gray-400 text-sm">暂无玩家</div>
                ) : (
                  <div className="space-y-2">
                    {players
                      .slice()
                      .sort((a, b) => String(a.position).localeCompare(String(b.position)))
                      .map(p => (
                        <div key={p.id} className="flex items-center justify-between gap-2 bg-black/30 border border-white/10 rounded-2xl px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-gray-100 truncate">
                              {p.name}
                              {p.name.includes('电脑') && <span className="ml-2 text-[10px] text-blue-400">[AI]</span>}
                              {p.role === 'banker' && <span className="ml-2 text-[10px] text-red-400">[庄]</span>}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              位置：{positionLabel(p.position)}｜准备：{p.is_ready ? '是' : '否'}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={async () => {
                                const { error: e } = await supabase
                                  .from('players')
                                  .update({ is_active: false, left_at: new Date().toISOString(), position: null, is_ready: false })
                                  .eq('id', p.id);
                                if (e) return alert(e.message);
                                await fetchPlayers(selectedRoom.id);
                                await fetchRooms();
                              }}
                              className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-800 hover:bg-gray-700 border border-white/10"
                            >
                              踢出
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                <div className="mt-5 text-[10px] text-gray-400 mb-2">语音举报</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {([
                    ['all', `全部 ${voiceReportStats.all}`],
                    ['open', `待处理 ${voiceReportStats.open}`],
                    ['reviewed', `已阅 ${voiceReportStats.reviewed}`],
                    ['resolved', `已解决 ${voiceReportStats.resolved}`],
                    ['rejected', `驳回 ${voiceReportStats.rejected}`],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setVoiceReportFilter(key)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
                        voiceReportFilter === key
                          ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-200'
                          : 'bg-black/30 border-white/10 text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {voiceReportsLoading ? (
                  <div className="py-6 text-center text-gray-400 text-sm">加载中...</div>
                ) : filteredVoiceReports.length === 0 ? (
                  <div className="py-6 text-center text-gray-400 text-sm">暂无语音举报</div>
                ) : (
                  <div className="space-y-2">
                    {filteredVoiceReports.map(report => {
                      const reporter = players.find(p => p.id === report.reporter_player_id);
                      const target = players.find(p => p.id === report.target_player_id);
                      const targetActive = players.some(p => p.id === report.target_player_id);
                      const activePenalty = voicePenalties.find(
                        p =>
                          p.target_player_id === report.target_player_id &&
                          !p.revoked_at &&
                          (!p.expires_at || new Date(p.expires_at).getTime() > Date.now())
                      );
                      const review = async (nextStatus: 'reviewed' | 'resolved' | 'rejected') => {
                        const note = window.prompt(`处理举报为「${nextStatus}」的备注`, report.admin_note || '');
                        try {
                          const { error: e } = await supabase.rpc('rpc_review_voice_report', {
                            p_report_id: report.id,
                            p_status: nextStatus,
                            p_admin_note: note || null,
                          });
                          if (e) throw e;
                          await fetchVoiceReports(selectedRoom.id);
                        } catch (err) {
                          alert(err instanceof Error ? err.message : '处理失败');
                        }
                      };

                      return (
                        <div key={report.id} className="bg-black/30 border border-white/10 rounded-2xl px-3 py-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-bold text-gray-100">
                              {reporter?.name || '未知举报人'} {'->'} {target?.name || '未知被举报人'}
                            </div>
                            <div className="text-[10px] text-yellow-300">{getVoiceReportStatusLabel(report.status)}</div>
                          </div>
                          <div className="text-[10px] text-gray-300">原因：{report.reason}</div>
                          <div className="text-[10px] text-gray-500">
                            提交：{new Date(report.created_at).toLocaleString()}
                            {report.reviewed_at ? ` ｜ 审核：${new Date(report.reviewed_at).toLocaleString()}` : ''}
                          </div>
                          {report.admin_note && (
                            <div className="text-[10px] text-gray-400">备注：{report.admin_note}</div>
                          )}
                          {activePenalty && (
                            <div className="text-[10px] text-red-300">
                              已禁言至：{activePenalty.expires_at ? new Date(activePenalty.expires_at).toLocaleString() : '长期'}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => { void review('reviewed'); }}
                              className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-600/20 border border-amber-500/30 text-amber-200 hover:bg-amber-600/30"
                            >
                              标记已阅
                            </button>
                            <button
                              onClick={() => { void review('resolved'); }}
                              className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-600/30"
                            >
                              已解决
                            </button>
                            <button
                              onClick={() => { void review('rejected'); }}
                              className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-600/20 border border-red-500/30 text-red-200 hover:bg-red-600/30"
                            >
                              驳回
                            </button>
                            {targetActive && (
                              <button
                                onClick={async () => {
                                  if (!selectedRoom) return;
                                  if (!confirm(`确认踢出 ${target?.name || '该玩家'}？`)) return;
                                  try {
                                    const { error: e } = await supabase
                                      .from('players')
                                      .update({ is_active: false, left_at: new Date().toISOString(), position: null, is_ready: false })
                                      .eq('id', report.target_player_id);
                                    if (e) throw e;
                                    await fetchPlayers(selectedRoom.id);
                                    await fetchRooms();
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : '踢出失败');
                                  }
                                }}
                                className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-700 hover:bg-gray-600 border border-white/10 text-white"
                              >
                                踢出被举报人
                              </button>
                            )}
                            {selectedRoom && !activePenalty && (
                              <button
                                onClick={async () => {
                                  try {
                                    const { error: e } = await supabase.rpc('rpc_issue_voice_penalty', {
                                      p_room_id: selectedRoom.id,
                                      p_target_player_id: report.target_player_id,
                                      p_report_id: report.id,
                                      p_reason: report.reason,
                                      p_duration_minutes: 30,
                                    });
                                    if (e) throw e;
                                    await fetchVoicePenalties(selectedRoom.id);
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : '禁言失败');
                                  }
                                }}
                                className="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-600/20 border border-purple-500/30 text-purple-200 hover:bg-purple-600/30"
                              >
                                禁言30分钟
                              </button>
                            )}
                            {selectedRoom && activePenalty && (
                              <button
                                onClick={async () => {
                                  try {
                                    const { error: e } = await supabase.rpc('rpc_revoke_voice_penalty', {
                                      p_penalty_id: activePenalty.id,
                                    });
                                    if (e) throw e;
                                    await fetchVoicePenalties(selectedRoom.id);
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : '解除禁言失败');
                                  }
                                }}
                                className="text-[10px] font-bold px-2 py-1 rounded-full bg-sky-600/20 border border-sky-500/30 text-sky-200 hover:bg-sky-600/30"
                              >
                                解除禁言
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
