type SoundKind = 'click' | 'build' | 'dice' | 'capture' | 'victory' | 'error' | 'trade';

const STORAGE_KEY = 'pokecatan.sound.v1';

let enabled = false;
let volume = 0.35;
let context: AudioContext | null = null;

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as { enabled?: boolean; volume?: number };
    enabled = Boolean(parsed.enabled);
    if (typeof parsed.volume === 'number') volume = Math.max(0, Math.min(1, parsed.volume));
  }
} catch {
  enabled = false;
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, volume }));
  } catch {
    // Sin almacenamiento: el ajuste solo dura la sesión actual.
  }
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    context = new AudioCtor();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

export function soundEnabled(): boolean {
  return enabled;
}

export function soundVolume(): number {
  return volume;
}

export function setSoundEnabled(next: boolean): void {
  enabled = next;
  persist();
}

export function setSoundVolume(next: number): void {
  volume = Math.max(0, Math.min(1, next));
  persist();
}

function tone(frequency: number, duration: number, delay = 0, type: OscillatorType = 'square', gain = 0.08): void {
  const ctx = audioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const amp = ctx.createGain();
  const start = ctx.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain * volume, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(amp);
  amp.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function playSound(kind: SoundKind): void {
  if (!enabled) return;
  switch (kind) {
    case 'click':
      tone(440, 0.06, 0, 'square', 0.05);
      break;
    case 'build':
      tone(330, 0.09);
      tone(494, 0.12, 0.08);
      break;
    case 'dice':
      tone(220, 0.06);
      tone(330, 0.06, 0.07);
      tone(440, 0.08, 0.14);
      break;
    case 'capture':
      tone(523, 0.08);
      tone(659, 0.08, 0.08);
      tone(784, 0.16, 0.16);
      break;
    case 'trade':
      tone(392, 0.07);
      tone(523, 0.1, 0.07);
      break;
    case 'victory':
      tone(523, 0.12);
      tone(659, 0.12, 0.12);
      tone(784, 0.12, 0.24);
      tone(1047, 0.3, 0.36, 'triangle', 0.12);
      break;
    case 'error':
      tone(180, 0.12, 0, 'sawtooth', 0.05);
      tone(140, 0.16, 0.1, 'sawtooth', 0.05);
      break;
  }
}
