// Little "bonk + beep-boop" played when someone hits Alox on the login page.
// Synthesized with the Web Audio API — no audio files to download.
// `level` (0, 1, 2…) is how many times Alox has been hit: the reply gets lower
// and grumpier each time.

export const ROBOT_SOUND_KEY = "zv_robot_sound";

export function robotSoundEnabled(): boolean {
  try { return localStorage.getItem(ROBOT_SOUND_KEY) !== "off"; } catch { return true; }
}

export function setRobotSoundEnabled(on: boolean) {
  try { localStorage.setItem(ROBOT_SOUND_KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
  if (!on && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

let ctx: AudioContext | null = null;

// Chrome fills the voice list asynchronously — ask early so the first hit already has a nice voice.
if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.getVoices();

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, type: OscillatorType, from: number, to: number, start: number, dur: number, vol: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function playRobotHit(level: number, text: string) {
  if (!robotSoundEnabled()) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;

  // Metallic bonk: quick pitch drop + a short burst of noise.
  tone(ac, "triangle", 420, 90, t, 0.18, 0.35);
  const noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.06), ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  const ng = ac.createGain();
  ng.gain.value = 0.12;
  src.buffer = noise;
  src.connect(ng).connect(ac.destination);
  src.start(t);

  // Robot reply: Alox says it out loud (browser voice). Falls back to beeps where speech isn't available.
  const grumpy = Math.min(level, 6);
  if (!speak(text, grumpy)) {
    const base = 880 - grumpy * 90;
    const wave: OscillatorType = grumpy >= 4 ? "sawtooth" : "square";
    tone(ac, wave, base, base * 0.92, t + 0.2, 0.11, 0.07);
    tone(ac, wave, base * 0.75, base * (grumpy >= 3 ? 0.4 : 0.7), t + 0.33, 0.18, 0.07);
  }
}

// Drop the leading emoji and spell out short forms so the voice reads the bubble naturally.
function speakable(text: string): string {
  return text
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\.{3}/g, ", ")
    .replace(/\bKPI\b/g, "K.P.I.")
    .trim();
}

function speak(text: string, level: number): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  const line = speakable(text);
  if (!line) return false;
  const say = new SpeechSynthesisUtterance(line);
  // High, quick and cute at first; lower and slower as Alox gets angry.
  say.pitch = Math.max(0.4, 1.8 - level * 0.22);
  say.rate = Math.max(0.85, 1.15 - level * 0.05);
  say.volume = 1;
  const english = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  say.voice = english.find((v) => /google us english|samantha|zira|aria|jenny/i.test(v.name)) ?? english[0] ?? null;
  synth.cancel();                 // a new hit interrupts the previous line
  setTimeout(() => synth.speak(say), 180);  // right after the bonk
  return true;
}
