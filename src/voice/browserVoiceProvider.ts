import type { VoiceProvider, VoiceProviderJoinParams, VoiceProviderPermission } from './provider';

export class BrowserVoiceProvider implements VoiceProvider {
  readonly kind = 'browser' as const;
  private stream: MediaStream | null = null;

  async requestMicrophone(): Promise<{ permission: VoiceProviderPermission; stream: MediaStream | null }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      return {
        permission: 'granted',
        stream,
      };
    } catch {
      return {
        permission: 'denied',
        stream: null,
      };
    }
  }

  async joinRoom(params: VoiceProviderJoinParams): Promise<void> {
    const stream = this.stream;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !params.muted;
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    const stream = this.stream;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  async leaveRoom(): Promise<void> {
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
}
