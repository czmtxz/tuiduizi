import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, type Database } from '../lib/supabase';
import { clearVoiceDebugLogs, getVoiceDebugLogs, pushVoiceDebugLog, subscribeVoiceDebugLogs, type VoiceDebugEntry } from './debugLog';
import { createVoiceProvider, type VoiceProviderPreference } from './voiceProviderRegistry';

type VoiceSessionRow = Database['public']['Tables']['rtc_sessions']['Row'];
type VoicePenaltyRow = Database['public']['Tables']['voice_penalties']['Row'];
type AppSettingsRow = Database['public']['Tables']['app_settings']['Row'];
type VoiceStatus = 'off' | 'connecting' | 'on';
type MicPermission = 'unknown' | 'granted' | 'denied';

const env = import.meta.env as Record<string, string | undefined>;
const forcedProvider = String(env.VITE_FORCE_VOICE_PROVIDER || '').trim() as VoiceProviderPreference | '';

const getEffectiveProviderPreference = (dbPreference: VoiceProviderPreference): VoiceProviderPreference => {
  if (forcedProvider === 'agora' || forcedProvider === 'livekit' || forcedProvider === 'browser') {
    return forcedProvider;
  }
  return dbPreference;
};

const toVoiceErrorMessage = (message: string) => {
  if (message === 'Failed to fetch') {
    return '语音请求失败：通常是 token 服务 HTTPS 证书未被信任，或局域网端口/地址不可达。';
  }
  if (message.includes('invalid_agora_token')) {
    return 'Agora Token 无效，请检查 AppID、频道名和签名服务返回值。';
  }
  if (message.includes('agora-token-')) {
    return 'Agora 签名服务请求失败，请检查本地/服务器 token 接口是否运行。';
  }
  if (message.includes('获取 LiveKit token 失败')) {
    return 'LiveKit token 获取失败，请检查 token 服务或 Supabase Edge Function。';
  }
  if (message.includes('LiveKit token 缺失')) {
    return 'LiveKit token 返回值缺失，请检查服务端返回格式。';
  }
  return message;
};

export const useVoiceChat = (roomId: string | null, currentPlayerId: string | null) => {
  const [status, setStatus] = useState<VoiceStatus>('off');
  const [muted, setMuted] = useState(false);
  const [micPermission, setMicPermission] = useState<MicPermission>('unknown');
  const [sessions, setSessions] = useState<VoiceSessionRow[]>([]);
  const [penalties, setPenalties] = useState<VoicePenaltyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<VoiceDebugEntry[]>(() => getVoiceDebugLogs());
  const [providerPreference, setProviderPreference] = useState<VoiceProviderPreference>(getEffectiveProviderPreference('auto'));
  const providerRef = useRef(createVoiceProvider(undefined, getEffectiveProviderPreference('auto')));
  const [providerKind, setProviderKind] = useState(providerRef.current.kind);

  const refreshSessions = useCallback(async () => {
    if (!roomId) {
      setSessions([]);
      return;
    }
    const { data } = await supabase
      .from('rtc_sessions')
      .select('*')
      .eq('room_id', roomId)
      .order('updated_at', { ascending: false });
    setSessions((data || []) as VoiceSessionRow[]);
    pushVoiceDebugLog('voice', `刷新语音会话: ${(data || []).length} 条`);
  }, [roomId]);

  const refreshPenalties = useCallback(async () => {
    if (!roomId || !currentPlayerId) {
      setPenalties([]);
      return;
    }
    const { data } = await supabase
      .from('voice_penalties')
      .select('*')
      .eq('room_id', roomId)
      .eq('target_player_id', currentPlayerId)
      .order('created_at', { ascending: false });
    setPenalties((data || []) as VoicePenaltyRow[]);
  }, [currentPlayerId, roomId]);

  const refreshAppSettings = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('voice_provider')
      .eq('id', 1)
      .maybeSingle();
    const next = getEffectiveProviderPreference(
      ((data as Pick<AppSettingsRow, 'voice_provider'> | null)?.voice_provider || 'auto') as VoiceProviderPreference
    );
    setProviderPreference(next);
    if (next !== ((data as Pick<AppSettingsRow, 'voice_provider'> | null)?.voice_provider || 'auto')) {
      pushVoiceDebugLog('voice', `本地开发强制语音平台: ${next}`);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('permissions' in navigator)) return;

    let disposed = false;
    let permissionStatus: PermissionStatus | null = null;

    const applyPermissionState = (state: PermissionState) => {
      if (disposed) return;
      const next: MicPermission = state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'unknown';
      setMicPermission(prev => {
        if (prev === next) return prev;
        pushVoiceDebugLog('voice', `浏览器麦克风权限状态: ${next}`);
        return next;
      });
    };

    void navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        if (disposed) return;
        permissionStatus = status;
        applyPermissionState(status.state);
        status.onchange = () => applyPermissionState(status.state);
      })
      .catch(() => void 0);

    return () => {
      disposed = true;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);

  const releaseMic = useCallback(() => {
    void providerRef.current.leaveRoom();
  }, []);

  const syncServerState = useCallback(async (enabled: boolean, nextMuted: boolean, permission: MicPermission) => {
    if (!roomId) return;
    const { data, error } = await supabase.rpc('rpc_upsert_voice_session', {
      p_room_id: roomId,
      p_enabled: enabled,
      p_muted: nextMuted,
      p_mic_permission: permission,
    });
    if (error) throw error;
    const row = data?.[0];
    setStatus((row?.status as VoiceStatus) || (enabled ? 'on' : 'off'));
    setMuted(Boolean(row?.muted ?? nextMuted));
    pushVoiceDebugLog('voice', `上报语音状态: enabled=${enabled} muted=${nextMuted} permission=${permission}`);
    await refreshSessions();
  }, [refreshSessions, roomId]);

  const enableVoice = useCallback(async () => {
    if (!roomId) return;
    setError(null);
    setStatus('connecting');
    clearVoiceDebugLogs();
    pushVoiceDebugLog('voice', `开始开启语音，room=${roomId} player=${currentPlayerId || 'anonymous'}`);
    try {
      const provider = providerRef.current;
      const { permission } = await provider.requestMicrophone();
      if (permission !== 'granted') {
        throw new Error('mic-denied');
      }
      setMicPermission('granted');
      await provider.joinRoom({
        roomId,
        participantId: currentPlayerId || 'anonymous',
        muted: false,
      });
      await syncServerState(true, false, 'granted');
      pushVoiceDebugLog('voice', '语音开启完成');
    } catch (err) {
      const message = err instanceof Error ? err.message : '语音连接失败';
      const isMicDenied = message === 'mic-denied';
      const isMutedByAdmin = message === 'voice muted by admin' || message === 'voice_muted_by_admin';
      const isProviderMissing = message.includes('缺少') || message.includes('not_found') || message.includes('missing_env');
      setMicPermission(isMicDenied ? 'denied' : micPermission);
      setStatus('off');
      setError(
        isMicDenied
          ? '需要麦克风权限才能开启语音'
          : isMutedByAdmin
            ? '你已被管理员禁言，当前无法开启语音'
            : isProviderMissing
              ? '语音服务未配置完成，当前无法开启'
              : toVoiceErrorMessage(message)
      );
      pushVoiceDebugLog('voice', `语音开启失败: ${message}`);
      await syncServerState(false, true, isMicDenied ? 'denied' : micPermission).catch(() => void 0);
    }
  }, [currentPlayerId, micPermission, roomId, syncServerState]);

  const disableVoice = useCallback(async () => {
    setError(null);
    releaseMic();
    setMuted(true);
    setStatus('off');
    pushVoiceDebugLog('voice', '开始关闭语音');
    if (roomId) {
      const { error } = await supabase.rpc('rpc_leave_voice_session', { p_room_id: roomId });
      if (error) void 0;
      await refreshSessions();
    }
  }, [refreshSessions, releaseMic, roomId]);

  const toggleVoice = useCallback(async () => {
    if (status === 'on' || status === 'connecting') await disableVoice();
    else await enableVoice();
  }, [disableVoice, enableVoice, status]);

  const toggleMute = useCallback(async () => {
    const next = !muted;
    setMuted(next);
    await providerRef.current.setMuted(next);
    pushVoiceDebugLog('voice', `本地静音切换: ${next ? '静音' : '取消静音'}`);
    if (roomId && status === 'on') {
      await syncServerState(true, next, micPermission).catch(() => void 0);
    }
  }, [micPermission, muted, roomId, status, syncServerState]);

  const reportVoiceMember = useCallback(async (targetPlayerId: string, reason: string) => {
    if (!roomId) throw new Error('房间不存在');
    const trimmed = reason.trim();
    if (trimmed.length < 2) {
      throw new Error('举报原因至少 2 个字');
    }
    const { data, error } = await supabase.rpc('rpc_submit_voice_report', {
      p_room_id: roomId,
      p_target_player_id: targetPlayerId,
      p_reason: trimmed,
    });
    if (error) throw error;
    return data?.[0] ?? null;
  }, [roomId]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    void refreshPenalties();
  }, [refreshPenalties]);

  useEffect(() => {
    void refreshAppSettings();
  }, [refreshAppSettings]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`voice-sessions-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rtc_sessions', filter: `room_id=eq.${roomId}` },
        () => {
          refreshSessions();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_penalties', filter: `room_id=eq.${roomId}` },
        () => {
          refreshPenalties();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings', filter: 'id=eq.1' },
        () => {
          refreshAppSettings();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, refreshAppSettings, refreshPenalties, refreshSessions]);

  useEffect(() => {
    if (!roomId) return;
    const id = window.setInterval(() => {
      void refreshSessions();
    }, 1500);
    return () => {
      window.clearInterval(id);
    };
  }, [roomId, refreshSessions]);

  useEffect(() => {
    const provider = providerRef.current;
    return () => {
      void provider.dispose();
    };
  }, []);

  useEffect(() => {
    const current = providerRef.current;
    const next = createVoiceProvider(undefined, providerPreference);
    if (current.kind === next.kind) {
      setProviderKind(current.kind);
      return;
    }

    void current.dispose();
    providerRef.current = next;
    setProviderKind(next.kind);
    if (status !== 'off') {
      setStatus('off');
      setMuted(true);
      setError(`语音平台已切换为 ${next.kind}，请重新开启语音`);
    }
    pushVoiceDebugLog('voice', `语音平台切换为: ${providerPreference} -> ${next.kind}`);
  }, [providerPreference, status]);

  useEffect(() => {
    return subscribeVoiceDebugLogs(setDebugLogs);
  }, []);

  const activeMembers = useMemo(() => sessions.filter(s => s.status === 'on'), [sessions]);
  const me = useMemo(() => sessions.find(s => s.player_id === currentPlayerId) || null, [sessions, currentPlayerId]);
  const activePenalty = useMemo(
    () =>
      penalties.find(
        p => !p.revoked_at && (!p.expires_at || new Date(p.expires_at).getTime() > Date.now())
      ) || null,
    [penalties]
  );

  useEffect(() => {
    if (!me) return;
    setStatus(me.status);
    setMuted(me.muted);
    setMicPermission(me.mic_permission);
  }, [me]);

  useEffect(() => {
    if (!activePenalty) return;
    setError('你已被管理员禁言，当前无法开启语音');
    if (status === 'off') return;

    releaseMic();
    setMuted(true);
    setStatus('off');
    if (roomId) {
      void supabase.rpc('rpc_leave_voice_session', { p_room_id: roomId });
    }
  }, [activePenalty, releaseMic, roomId, status]);

  return {
    providerKind,
    status,
    muted,
    micPermission,
    sessions,
    activeMembers,
    activePenalty,
    error,
    debugLogs,
    setError,
    toggleVoice,
    toggleMute,
    reportVoiceMember,
    refreshPenalties,
    refreshSessions,
  };
};
