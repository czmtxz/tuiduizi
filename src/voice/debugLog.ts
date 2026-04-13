export type VoiceDebugEntry = {
  id: string;
  ts: number;
  scope: 'voice' | 'agora' | 'livekit';
  message: string;
};

type Listener = (entries: VoiceDebugEntry[]) => void;

const MAX_ENTRIES = 80;
let entries: VoiceDebugEntry[] = [];
const listeners = new Set<Listener>();

const emit = () => {
  for (const listener of listeners) listener(entries);
};

export const pushVoiceDebugLog = (scope: VoiceDebugEntry['scope'], message: string) => {
  const entry: VoiceDebugEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    scope,
    message,
  };
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    console.info(`[${scope}] ${message}`);
  }
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), entry];
  emit();
};

export const clearVoiceDebugLogs = () => {
  entries = [];
  emit();
};

export const getVoiceDebugLogs = () => entries;

export const subscribeVoiceDebugLogs = (listener: Listener) => {
  listeners.add(listener);
  listener(entries);
  return () => {
    listeners.delete(listener);
  };
};

