import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { pushVoiceDebugLog } from './debugLog';
import { fetchAgoraRtcToken, resolveAgoraConfig } from './agoraConfig';
import type { VoiceProvider, VoiceProviderJoinParams, VoiceProviderPermission } from './provider';

const loadAgoraRtc = async () => {
  const mod = await import('agora-rtc-sdk-ng');
  return mod.default;
};

export class AgoraVoiceProvider implements VoiceProvider {
  readonly kind = 'agora' as const;
  private stream: MediaStream | null = null;
  private client: IAgoraRTCClient | null = null;
  private localTrack: IMicrophoneAudioTrack | null = null;
  private remoteUsers = new Map<number, IAgoraRTCRemoteUser>();
  private joined = false;

  async requestMicrophone(): Promise<{ permission: VoiceProviderPermission; stream: MediaStream | null }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      pushVoiceDebugLog('voice', '麦克风权限已授权');
      return { permission: 'granted', stream };
    } catch {
      pushVoiceDebugLog('voice', '麦克风权限被拒绝');
      return { permission: 'denied', stream: null };
    }
  }

  async joinRoom(params: VoiceProviderJoinParams): Promise<void> {
    const config = resolveAgoraConfig();
    if (!config) throw new Error('缺少 Agora 配置');

    const { appId, channel, uid, token } = await fetchAgoraRtcToken(
      config,
      params.roomId,
      params.participantId
    );
    pushVoiceDebugLog('agora', `已拿到 RTC Token，channel=${channel} uid=${uid}`);

    const AgoraRTC = await loadAgoraRtc();
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this.client = client;
    this.bindClientEvents(client);

    await client.join(appId, channel, token, uid);
    this.joined = true;
    pushVoiceDebugLog('agora', '加入频道成功');

    const localTrack = await AgoraRTC.createMicrophoneAudioTrack();
    this.localTrack = localTrack;
    localTrack.setMuted(!!params.muted);
    await client.publish([localTrack]);
    pushVoiceDebugLog('agora', `本地麦克风已发布，状态=${params.muted ? '静音' : '开启'}`);
  }

  async setMuted(muted: boolean): Promise<void> {
    if (this.localTrack) {
      await this.localTrack.setMuted(muted);
      pushVoiceDebugLog('agora', `切换麦克风: ${muted ? '静音' : '取消静音'}`);
      return;
    }

    const stream = this.stream;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  async leaveRoom(): Promise<void> {
    const track = this.localTrack;
    this.localTrack = null;
    if (track) {
      track.stop();
      track.close();
      pushVoiceDebugLog('agora', '本地音轨已关闭');
    }

    this.remoteUsers.forEach((user) => {
      try {
        user.audioTrack?.stop();
      } catch {
        void 0;
      }
    });
    this.remoteUsers.clear();

    if (this.client) {
      try {
        await this.client.leave();
        pushVoiceDebugLog('agora', '已离开频道');
      } finally {
        this.client.removeAllListeners();
        this.client = null;
      }
    }
    this.joined = false;

    const stream = this.stream;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
    }
    this.stream = null;
  }

  async dispose(): Promise<void> {
    await this.leaveRoom();
  }

  private bindClientEvents(client: IAgoraRTCClient) {
    client.on('user-joined', (user) => {
      pushVoiceDebugLog('agora', `远端用户加入: ${String(user.uid)}`);
    });

    client.on('user-left', (user) => {
      this.remoteUsers.delete(Number(user.uid));
      try {
        user.audioTrack?.stop();
      } catch {
        void 0;
      }
      pushVoiceDebugLog('agora', `远端用户离开: ${String(user.uid)}`);
    });

    client.on('user-published', async (user, mediaType) => {
      pushVoiceDebugLog('agora', `远端发布: ${String(user.uid)} type=${mediaType}`);
      await client.subscribe(user, mediaType);
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.play();
        this.remoteUsers.set(Number(user.uid), user);
        pushVoiceDebugLog('agora', `已订阅并播放远端音频: ${String(user.uid)}`);
      }
    });

    client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'audio') {
        try {
          user.audioTrack?.stop();
        } catch {
          void 0;
        }
      }
      pushVoiceDebugLog('agora', `远端取消发布: ${String(user.uid)} type=${mediaType}`);
    });

    client.on('connection-state-change', (curState, prevState, reason) => {
      pushVoiceDebugLog('agora', `连接状态: ${prevState} -> ${curState}${reason ? ` (${reason})` : ''}`);
    });
  }
}

