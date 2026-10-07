// Alox's voice on the login page: a "bonk" when he is hit, then he says his
// speech-bubble line out loud with a matching emotion (crying, worried, angry…).
// Everything is synthesized in the browser (Web Audio + speech) — no audio files.

export type Mood = "happy" | "sad" | "worried" | "angry" | "furious" | "excited";

export const ROBOT_SOUND_KEY = "zv_robot_sound";

export function robotSoundEnabled(): boolean {
  try { return localStorage.getItem(ROBOT_SOUND_KEY) !== "off"; } catch { return true; }
}

export function setRobotSoundEnabled(on: boolean) {
  try { localStorage.setItem(ROBOT_SOUND_KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
  if (!on) stopTalking();
}

let ctx: AudioContext | null = null;

// Chrome fills the voice list asynchronously — ask early so the first line already has the right voice.
if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.getVoices();

// Browsers only allow sound after the visitor clicks or types on the page.
let interacted = false;
if (typeof window !== "undefined") {
  const mark = () => { interacted = true; };
  window.addEventListener("pointerdown", mark, { once: true, capture: true });
  window.addEventListener("keydown", mark, { once: true, capture: true });
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, type: OscillatorType, from: number, to: number, start: number, dur: number, vol: number, vibrato = 0) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), start + dur);
  if (vibrato) {
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = 9;
    depth.gain.value = vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(start);
    lfo.stop(start + dur + 0.02);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noiseBurst(ac: AudioContext, start: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, swell = false) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = swell ? Math.sin((i / data.length) * Math.PI) : 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  f.type = filter;
  f.frequency.value = freq;
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(f).connect(g).connect(ac.destination);
  src.start(start);
}

function bonk(ac: AudioContext, t: number) {
  tone(ac, "triangle", 420, 90, t, 0.18, 0.35);
  noiseBurst(ac, t, 0.06, 0.12, "lowpass", 4000);
}

// Three shaky little sobs ("huh-huh-huh") with a breath on each.
function sobs(ac: AudioContext, t: number) {
  for (let i = 0; i < 3; i++) {
    const s = t + i * 0.2;
    tone(ac, "triangle", 560 - i * 30, 380, s, 0.15, 0.16, 28);
    noiseBurst(ac, s, 0.12, 0.05, "bandpass", 1400, true);
  }
}

// A wet sniffle: two short rising breaths of filtered noise.
function sniffle(ac: AudioContext, t: number) {
  noiseBurst(ac, t, 0.16, 0.22, "highpass", 2200, true);
  noiseBurst(ac, t + 0.22, 0.24, 0.26, "highpass", 2600, true);
}

// --- Speech -----------------------------------------------------------------

// The voice the earlier version used (the one people liked), then any English voice.
function pickVoice(): SpeechSynthesisVoice | null {
  const english = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  return english.find((v) => /google us english|samantha|zira|aria|jenny/i.test(v.name)) ?? english[0] ?? null;
}

const VOICE: Record<Mood, { pitch: number; rate: number }> = {
  happy:   { pitch: 1.6,  rate: 1.08 },
  sad:     { pitch: 1.7,  rate: 0.85 },
  worried: { pitch: 1.45, rate: 1.18 },
  angry:   { pitch: 0.85, rate: 1.0 },
  furious: { pitch: 0.6,  rate: 0.92 },
  excited: { pitch: 1.95, rate: 1.2 },
};

// Drop the leading emoji and spell out short forms so the voice reads the bubble naturally.
function speakable(text: string): string {
  return text
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\bSIU+\b/g, "Siuuuuu")
    .replace(/\.{3}/g, ", ")
    .replace(/\bKPI\b/g, "K.P.I.")
    .trim();
}

// Every new line bumps this, so anything still scheduled from an older line is skipped.
let talkId = 0;

function stopTalking() {
  talkId++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function utter(text: string, pitch: number, rate: number, voice: SpeechSynthesisVoice | null) {
  const u = new SpeechSynthesisUtterance(text);
  u.pitch = Math.min(2, Math.max(0.1, pitch));
  u.rate = rate;
  u.volume = 1;
  u.voice = voice;
  return u;
}

// Says `text` with the mood's voice. `delayMs` leaves room for the bonk / sobs first.
function speak(text: string, mood: Mood, delayMs: number, onDone?: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const line = speakable(text);
  if (!line) return false;
  const synth = window.speechSynthesis;
  stopTalking();
  const id = talkId;
  const voice = pickVoice();
  const { pitch, rate } = VOICE[mood];

  setTimeout(() => {
    if (id !== talkId) return;
    // Crying lines repeat the first word with a pause ("Why… why would you…"),
    // said smoothly in one go — the sobs and sniffle around it carry the crying.
    let said = line;
    if (mood === "sad") {
      const first = line.split(/\s+/)[0].replace(/[^A-Za-z']/g, "");
      if (first.length > 2) said = `${first}… ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
    }
    const u = utter(said, pitch, rate, voice);
    if (onDone) u.onend = () => { if (id === talkId) onDone(); };
    synth.speak(u);
  }, delayMs);
  return true;
}

// Alox reads one of his normal (introduction) lines — once per visit each.
const spokenTips = new Set<string>();

export function sayLine(text: string) {
  if (!interacted || !robotSoundEnabled() || spokenTips.has(text)) return;
  spokenTips.add(text);
  speak(text, "happy", 0);
}

// Hit: bonk, then the bubble line in the bubble's mood (crying gets sobs before and a sniffle after).
export function playRobotHit(text: string, mood: Mood) {
  if (!robotSoundEnabled()) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  bonk(ac, t);

  if (mood === "sad") {
    sobs(ac, t + 0.25);
    const spoke = speak(text, "sad", 900, () => {
      const a = audio();
      if (a && robotSoundEnabled()) sniffle(a, a.currentTime + 0.1);
    });
    if (spoke) return;
  } else if (speak(text, mood, 200)) {
    return;
  }

  // No speech in this browser: two little beeps instead.
  const low = mood === "angry" || mood === "furious";
  tone(ac, low ? "sawtooth" : "square", low ? 420 : 880, low ? 380 : 820, t + 0.2, 0.11, 0.07);
  tone(ac, low ? "sawtooth" : "square", low ? 300 : 660, low ? 170 : 600, t + 0.33, 0.18, 0.07);
}
