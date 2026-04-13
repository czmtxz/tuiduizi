import type {
  Room,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
} from 'livekit-client';
import { pushVoiceDebugLog } from './debugLog';
import type { VoiceProvider, VoiceProviderJoinParams, VoiceProviderPermission } from './provider';
import { fetchLiveKitToken, resolveLiveKitConfig } from './livekitConfig';
import { supabase } from '../lib/supabase';

const env = import.meta.env as Record<string, string | undefined>;
const loadLiveKit = () => import('livekit-client');

const ensureLiveKitAudioWrap = () => {
  const existing = document.getElementById('livekit-audio-wrap');
  if (existing) return existing;
  const el = document.createElement('div');
  el.id = 'livekit-audio-wrap';
  el.style.display = 'none';
  document.body.appendChild(el);
  return el;
};

export class LiveKitVoiceProvider implements VoiceProvider {
  readonly kind = 'livekit' as const;
  private stream: MediaStream | null = null;
  private room: Room | null = null;
  private attachedAudioElements = new Map<string, HTMLMediaElement>();

  async requestMicrophone(): Promise<{ permission: VoiceProviderPermission; stream: MediaStream | null }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      pushVoiceDebugLog('voice', '麦克风权限已授权');
      return {
        permission: 'granted',
        stream,
      };
    } catch {
      pushVoiceDebugLog('voice', '麦克风权限被拒绝');
      return {
        permission: 'denied',
        stream: null,
      };
    }
  }

  async joinRoom(params: VoiceProviderJoinParams): Promise<void> {
    const config = resolveLiveKitConfig(env);
    if (!config) {
      throw new Error('缺少 LiveKit 配置');
    }

    const livekit = await loadLiveKit();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    const token = await fetchLiveKitToken(
      config,
      params.roomId,
      params.participantId,
      fetch,
      accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
    );
    pushVoiceDebugLog('livekit', '已拿到 LiveKit token');

    const room = new livekit.Room();
    this.bindRoomEvents(room);
    await room.connect(config.url, token, {
      autoSubscribe: true,
    });
    pushVoiceDebugLog('livekit', 'LiveKit 房间连接成功');
    await room.localParticipant.setMicrophoneEnabled(!params.muted);
    pushVoiceDebugLog('livekit', `本地麦克风已${params.muted ? '关闭' : '开启'}`);
    this.room = room;
  }

  async setMuted(muted: boolean): Promise<void> {
    if (this.room) {
      await this.room.localParticipant.setMicrophoneEnabled(!muted);
      pushVoiceDebugLog('livekit', `切换麦克风: ${muted ? '静音' : '取消静音'}`);
      return;
    }
    const stream = this.stream;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  async leaveRoom(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
      pushVoiceDebugLog('livekit', '已断开 LiveKit 房间');
    }
    this.clearAttachedAudio();
    const stream = this.stream;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      track.stop();
    }
    this.stream = null;
  }

  async dispose(): Promise<void> {
    await this.leaveRoom();
  }

  private bindRoomEvents(room: Room) {
    room.on('trackSubscribed', (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind !== 'audio') return;
      const wrap = ensureLiveKitAudioWrap();
      const element = track.attach();
      wrap.appendChild(element);
      this.attachedAudioElements.set(publication.trackSid, element);
      pushVoiceDebugLog('livekit', `已订阅并播放 LiveKit 远端音频: ${participant.identity}`);
    });

    room.on('trackUnsubscribed', (_track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      const el = this.attachedAudioElements.get(publication.trackSid);
      if (el) {
        el.remove();
        this.attachedAudioElements.delete(publication.trackSid);
      }
      pushVoiceDebugLog('livekit', `远端音频取消订阅: ${participant.identity}`);
    });

    room.on('participantConnected', (participant: RemoteParticipant) => {
      pushVoiceDebugLog('livekit', `远端加入 LiveKit: ${participant.identity}`);
    });

    room.on('participantDisconnected', (participant: RemoteParticipant) => {
      pushVoiceDebugLog('livekit', `远端离开 LiveKit: ${participant.identity}`);
    });

    room.on('disconnected', () => {
      pushVoiceDebugLog('livekit', 'LiveKit 房间已断开');
    });
  }

  private clearAttachedAudio() {
    for (const el of this.attachedAudioElements.values()) {
      el.remove();
    }
    this.attachedAudioElements.clear();
  }
}
