export type VoiceProviderPermission = 'unknown' | 'granted' | 'denied';
export type VoiceProviderKind = 'browser' | 'livekit' | 'agora';

export type VoiceProviderJoinParams = {
  roomId: string;
  participantId: string;
  muted: boolean;
};

export interface VoiceProvider {
  readonly kind: VoiceProviderKind;
  requestMicrophone(): Promise<{
    permission: VoiceProviderPermission;
    stream: MediaStream | null;
  }>;
  joinRoom(params: VoiceProviderJoinParams): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  leaveRoom(): Promise<void>;
  dispose(): Promise<void>;
}
