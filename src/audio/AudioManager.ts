import type { AudioPrefs, PlaySfxOptions, VoiceTask } from './types';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const makeId = () => {
  const rnd = Math.random().toString(16).slice(2);
  return `${Date.now().toString(16)}-${rnd}`;
};

type BufferEntry = { state: 'ready'; buffer: AudioBuffer } | { state: 'loading'; promise: Promise<AudioBuffer> };

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;

  private bgmEl: HTMLAudioElement | null = null;
  private bgmSrc: MediaElementAudioSourceNode | null = null;

  private prefs: AudioPrefs | null = null;
  private unlocked = false;
  private needsUnlock = false;

  private bufferCache = new Map<string, BufferEntry>();
  private cooldown = new Map<string, number>();

  private voiceQueue: VoiceTask[] = [];
  private voicePlaying = false;
  private currentVoiceSource: AudioBufferSourceNode | null = null;

  private wasHidden = false;

  getIsUnlocked() {
    return this.unlocked;
  }

  getNeedsUnlock() {
    return this.needsUnlock;
  }

  setPrefs(p: AudioPrefs) {
    this.prefs = p;
    this.applyGains();
    if (!p.bgmEnabled || p.muted) {
      this.pauseBgm();
    }
    if (!p.voiceEnabled || p.muted) {
      this.stopVoice();
    }
  }

  async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
        if (!Ctx) return false;
        this.ctx = new Ctx();
        this.masterGain = this.ctx.createGain();
        this.bgmGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.voiceGain = this.ctx.createGain();

        this.bgmGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.voiceGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      }

      if (this.ctx.state !== 'running') {
        await this.ctx.resume();
      }
      this.unlocked = this.ctx.state === 'running';
      if (this.unlocked) this.needsUnlock = false;
      this.applyGains();
      return this.unlocked;
    } catch {
      this.needsUnlock = true;
      return false;
    }
  }

  private shouldPlayChannel(ch: 'bgm' | 'sfx' | 'voice') {
    const p = this.prefs;
    if (!p) return false;
    if (p.muted) return false;
    if (p.masterVolume <= 0) return false;
    if (ch === 'bgm') return p.bgmEnabled;
    if (ch === 'sfx') return p.sfxEnabled && p.sfxVolume > 0;
    return p.voiceEnabled && p.voiceVolume > 0;
  }

  private applyGains() {
    const p = this.prefs;
    if (!p) return;
    if (!this.masterGain || !this.bgmGain || !this.sfxGain || !this.voiceGain) return;

    const master = p.muted ? 0 : clamp01(p.masterVolume);
    const bgm = this.shouldPlayChannel('bgm') ? 1 : 0;
    const sfx = this.shouldPlayChannel('sfx') ? clamp01(p.sfxVolume) : 0;
    const voice = this.shouldPlayChannel('voice') ? clamp01(p.voiceVolume) : 0;

    this.masterGain.gain.value = master;
    this.bgmGain.gain.value = bgm;
    this.sfxGain.gain.value = sfx;
    this.voiceGain.gain.value = voice;
  }

  async preload(urls: string[]) {
    if (!urls.length) return;
    await this.ensureUnlockedSilent();
    if (!this.ctx) return;
    const uniq = Array.from(new Set(urls));
    await Promise.all(
      uniq.map(async url => {
        try {
          await this.getBuffer(url);
        } catch {
          void 0;
        }
      })
    );
  }

  private async ensureUnlockedSilent() {
    if (this.unlocked) return;
    await this.unlock();
  }

  private async ensureUnlockedForPlay() {
    if (this.unlocked) return true;
    const ok = await this.unlock();
    if (!ok) this.needsUnlock = true;
    return ok;
  }

  private async getBuffer(url: string): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error('no-audio-context');
    const existing = this.bufferCache.get(url);
    if (existing?.state === 'ready') return existing.buffer;
    if (existing?.state === 'loading') return existing.promise;

    const p = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch-failed:${res.status}`);
      const arr = await res.arrayBuffer();
      const t0 = now();
      const buf = await this.ctx!.decodeAudioData(arr);
      const t1 = now();
      if (t1 - t0 > 12) {
        void 0;
      }
      this.bufferCache.set(url, { state: 'ready', buffer: buf });
      return buf;
    })();

    this.bufferCache.set(url, { state: 'loading', promise: p });
    return p;
  }

  private playOsc(channel: 'sfx' | 'voice', frequency: number, durationMs: number, volume: number) {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.voiceGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const out = channel === 'sfx' ? this.sfxGain : this.voiceGain;

    osc.type = 'sine';
    osc.frequency.value = Math.max(40, frequency);
    g.gain.value = Math.max(0, Math.min(1, volume));
    osc.connect(g);
    g.connect(out);
    const t = this.ctx.currentTime;
    osc.start(t);
    osc.stop(t + Math.max(0.02, durationMs / 1000));
  }

  async playSfx(url: string, opts?: PlaySfxOptions) {
    if (!this.shouldPlayChannel('sfx')) return;
    const ok = await this.ensureUnlockedForPlay();
    if (!ok || !this.ctx || !this.sfxGain) return;

    const p0 = this.prefs;
    const spatialEnabled = !!p0?.spatialEnabled;

    try {
      const buffer = await this.getBuffer(url);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      if (typeof opts?.playbackRate === 'number') src.playbackRate.value = Math.max(0.25, Math.min(4, opts.playbackRate));
      if (typeof opts?.detune === 'number') src.detune.value = Math.max(-2400, Math.min(2400, opts.detune));

      const gain = this.ctx.createGain();
      gain.gain.value = typeof opts?.volume === 'number' ? clamp01(opts.volume) : 1;

      const spatial = spatialEnabled ? opts?.spatial : undefined;
      const pan = spatialEnabled && typeof opts?.pan === 'number' ? Math.max(-1, Math.min(1, opts.pan)) : null;

      if (spatial) {
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 20;
        panner.rolloffFactor = 1;
        panner.positionX.value = spatial.x;
        panner.positionY.value = spatial.y;
        panner.positionZ.value = spatial.z;
        src.connect(gain);
        gain.connect(panner);
        panner.connect(this.sfxGain);
      } else if (pan !== null && (this.ctx as unknown as { createStereoPanner?: () => StereoPannerNode }).createStereoPanner) {
        const p = (this.ctx as unknown as { createStereoPanner: () => StereoPannerNode }).createStereoPanner();
        p.pan.value = pan;
        src.connect(gain);
        gain.connect(p);
        p.connect(this.sfxGain);
      } else {
        src.connect(gain);
        gain.connect(this.sfxGain);
      }

      src.start();
    } catch {
      const base = 320;
      const freq = base + (opts?.detune ? opts.detune / 4 : 0);
      this.playOsc('sfx', freq, 90, 0.18);
    }
  }

  async startBgm(url: string, loop = true) {
    if (!this.shouldPlayChannel('bgm')) return;
    const ok = await this.ensureUnlockedForPlay();
    if (!ok || !this.ctx || !this.bgmGain) return;

    if (!this.bgmEl) {
      this.bgmEl = new Audio();
      this.bgmEl.preload = 'auto';
      this.bgmEl.loop = loop;
      this.bgmEl.crossOrigin = 'anonymous';
      this.bgmSrc = this.ctx.createMediaElementSource(this.bgmEl);
      this.bgmSrc.connect(this.bgmGain);
    }

    this.bgmEl.loop = loop;
    if (this.bgmEl.src !== new URL(url, window.location.href).toString()) {
      this.bgmEl.src = url;
    }
    try {
      await this.bgmEl.play();
    } catch {
      this.needsUnlock = true;
    }
  }

  pauseBgm() {
    if (this.bgmEl) this.bgmEl.pause();
  }

  resumeBgm() {
    const p = this.prefs;
    if (!p) return;
    if (!p.bgmEnabled || p.muted) return;
    if (this.bgmEl) {
      this.bgmEl.play().catch(() => {
        this.needsUnlock = true;
      });
    }
  }

  stopBgm() {
    if (!this.bgmEl) return;
    this.bgmEl.pause();
    this.bgmEl.currentTime = 0;
  }

  enqueueVoice(
    task: ({ id?: string } & (Omit<Extract<VoiceTask, { kind: 'url' }>, 'id'> | Omit<Extract<VoiceTask, { kind: 'tts' }>, 'id'>))
  ) {
    if (!this.prefs) return;
    const id = task.id || makeId();
    const p = this.prefs;
    const full = (() => {
      const base = { ...task, id } as VoiceTask;
      if (base.kind !== 'tts') return base;
      if (!p.voiceFxEnabled) return { ...base, rate: 1, pitch: 1 };
      return base;
    })();

    if (full.dedupeKey) {
      const t = now();
      const last = this.cooldown.get(full.dedupeKey) || 0;
      const cd = Math.max(0, full.cooldownMs ?? 0);
      if (cd > 0 && t - last < cd) return;
      this.cooldown.set(full.dedupeKey, t);
    }

    if (!this.shouldPlayChannel('voice')) return;

    if (full.interrupt) {
      this.stopVoice();
      this.voiceQueue.unshift(full);
    } else {
      this.voiceQueue.push(full);
    }

    this.voiceQueue.sort((a, b) => b.priority - a.priority);
    this.drainVoice();
  }

  clearVoiceQueue() {
    this.voiceQueue = [];
    this.stopVoice();
  }

  private stopVoice() {
    try {
      if (this.currentVoiceSource) {
        this.currentVoiceSource.stop();
        this.currentVoiceSource.disconnect();
      }
    } catch {
      void 0;
    } finally {
      this.currentVoiceSource = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.voicePlaying = false;
  }

  private async drainVoice() {
    if (this.voicePlaying) return;
    if (!this.shouldPlayChannel('voice')) return;
    const next = this.voiceQueue.shift();
    if (!next) return;
    this.voicePlaying = true;

    const ok = await this.ensureUnlockedForPlay();
    if (!ok) {
      this.voicePlaying = false;
      return;
    }

    if (next.kind === 'tts') {
      if (!('speechSynthesis' in window)) {
        this.playOsc('voice', 220, 120, 0.14);
        this.voicePlaying = false;
        this.drainVoice();
        return;
      }
      const u = new SpeechSynthesisUtterance(next.text);
      u.lang = next.lang || 'zh-CN';
      if (typeof next.rate === 'number') u.rate = Math.max(0.5, Math.min(2, next.rate));
      if (typeof next.pitch === 'number') u.pitch = Math.max(0, Math.min(2, next.pitch));
      const p = this.prefs;
      if (p) {
        const master = p.muted ? 0 : clamp01(p.masterVolume);
        const v = p.voiceEnabled ? clamp01(p.voiceVolume) : 0;
        u.volume = clamp01(master * v);
      }
      u.onend = () => {
        this.voicePlaying = false;
        this.drainVoice();
      };
      u.onerror = () => {
        this.voicePlaying = false;
        this.drainVoice();
      };
      window.speechSynthesis.speak(u);
      return;
    }

    try {
      if (!this.ctx || !this.voiceGain) throw new Error('no-audio');
      const buffer = await this.getBuffer(next.url);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.voiceGain);
      this.currentVoiceSource = src;
      src.onended = () => {
        this.currentVoiceSource = null;
        this.voicePlaying = false;
        this.drainVoice();
      };
      src.start();
    } catch {
      this.playOsc('voice', 210, 160, 0.12);
      this.voicePlaying = false;
      this.drainVoice();
    }
  }

  onVisibilityChange(hidden: boolean) {
    this.wasHidden = hidden;
    if (hidden) {
      this.pauseBgm();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (this.ctx && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => void 0);
      }
    } else {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {
          this.needsUnlock = true;
        });
      }
      this.resumeBgm();
    }
  }

  getWasHidden() {
    return this.wasHidden;
  }
}
