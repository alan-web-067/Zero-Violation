"use client";

import { playRobotHit, robotSoundEnabled, sayLine, setRobotSoundEnabled } from "@/lib/robotSound";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import * as Label from "@radix-ui/react-label";
import { apiClient, getMe, clearStoredAuth, AUTH_TOKEN_KEY, ME_KEY } from "@/lib/apiClient";

const NORMAL_DELAY = 11000;
const HIT_DELAY = 7500;

const ROBOT_TIPS = [
  { text: "👋 Welcome Algo Elites.", img: "/alox/alox-welcome.png" },
  { text: "🤖 This is Alox.", img: "/alox/alox-neutral.png" },
  { text: "📊 I'm your KPI adviser.", img: "/alox/alox-adviser.png" },
  { text: "🏆 I monitor rankings and performance.", img: "/alox/alox-smile.png" },
  { text: "🚀 Let's build a zero-violation day.", img: "/alox/alox-thumbsup.png" },
];

const HIT_MESSAGES = [
  { text: "🥺 Why would you do that?", img: "/alox/alox-sad.png" },
  { text: "💔 Safety robots have feelings too.", img: "/alox/alox-hurt.png" },
  { text: "😢 My circuits are hurt.", img: "/alox/alox-xeyes.png" },
  { text: "⚠️ Unsafe operation: hitting company mascot.", img: "/alox/alox-warning.png" },
  { text: "📈 I can make your KPI worse if you keep doing that!", img: "/alox/alox-alert.png" },
  { text: "😡 One more click and I will raise your points.", img: "/alox/alox-angry.png" },
  { text: "🤖 I'm not saying I'll increase KPI... but I'm thinking about it.", img: "/alox/alox-rage.png" },
  { text: "🚨 Robot abuse violation detected.", img: "/alox/alox-robot-abuse.png" },
  { text: "⚽ SIUUU! Okay, I'm calm now.", img: "/alox/alox-thumbsup.png" },
];

/* Deterministic particle positions for the hero panel */
const PARTICLES = [
  { id: 1, x: 12,  y: 68, size: 3.5, dur: 5.2, delay: 0.0  },
  { id: 2, x: 28,  y: 78, size: 2.5, dur: 4.6, delay: 1.3  },
  { id: 3, x: 48,  y: 73, size: 3.0, dur: 6.0, delay: 0.5  },
  { id: 4, x: 68,  y: 81, size: 2.0, dur: 4.8, delay: 2.1  },
  { id: 5, x: 84,  y: 70, size: 2.5, dur: 5.5, delay: 0.8  },
  { id: 6, x: 55,  y: 84, size: 2.0, dur: 4.4, delay: 3.2  },
  { id: 7, x: 22,  y: 58, size: 3.0, dur: 5.8, delay: 1.7  },
  { id: 8, x: 78,  y: 56, size: 2.0, dur: 4.9, delay: 2.6  },
  { id: 9, x: 38,  y: 88, size: 2.5, dur: 5.3, delay: 0.4  },
  { id: 10, x: 90, y: 44, size: 1.8, dur: 4.7, delay: 3.8  },
];

export default function LoginPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [robotMsg, setRobotMsg] = useState(ROBOT_TIPS[0].text);
  const [robotImg, setRobotImg] = useState(ROBOT_TIPS[0].img);
  const [robotMode, setRobotMode] = useState<"normal" | "hit">("normal");
  const [hitCount, setHitCount] = useState(0);
  const [soundOn, setSoundOn] = useState(() => (typeof window === "undefined" ? true : robotSoundEnabled()));

  const normalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hitTimerRef = useRef<NodeJS.Timeout | null>(null);

  function stopNormalRotation() {
    if (normalTimerRef.current) { clearInterval(normalTimerRef.current); normalTimerRef.current = null; }
  }

  // Alox reads his introduction lines out loud as they appear (hit lines are spoken in handleRobotHit).
  const introRef = useRef({ msg: "", normal: true });
  useEffect(() => {
    introRef.current = { msg: robotMsg, normal: robotMode === "normal" };
    if (robotMode === "normal") sayLine(robotMsg);
  }, [robotMsg, robotMode]);

  // Sound can only start after the first click or key press — say the current line then.
  useEffect(() => {
    const onFirst = (e: Event) => {
      if ((e.target as Element | null)?.closest?.(".ll-robot-btn, .ll-sound-btn")) return;
      if (introRef.current.normal) sayLine(introRef.current.msg);
    };
    window.addEventListener("pointerdown", onFirst, { once: true });
    window.addEventListener("keydown", onFirst, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
  }, []);

  function startNormalRotation() {
    stopNormalRotation();
    normalTimerRef.current = setInterval(() => {
      setRobotMode("normal");
      setRobotMsg((prev) => {
        const idx = ROBOT_TIPS.findIndex((t) => t.text === prev);
        const next = (idx + 1) % ROBOT_TIPS.length;
        setRobotImg(ROBOT_TIPS[next].img);
        return ROBOT_TIPS[next].text;
      });
    }, NORMAL_DELAY);
  }

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      // Only skip the form when the saved session still works; otherwise forget it
      // (prevents bouncing between this page and the dashboard).
      getMe()
        .then(() => router.replace("/dashboard"))
        .catch(() => { clearStoredAuth(); setMounted(true); startNormalRotation(); });
      return () => stopNormalRotation();
    }
    setMounted(true);
    startNormalRotation();
    return () => {
      stopNormalRotation();
      if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRobotHit() {
    stopNormalRotation();
    if (hitTimerRef.current) { clearTimeout(hitTimerRef.current); hitTimerRef.current = null; }
    const hit = HIT_MESSAGES[hitCount % HIT_MESSAGES.length];
    playRobotHit(hitCount, hit.text);   // Alox says exactly what the bubble shows
    setHitCount((c) => c + 1);
    setRobotMode("hit");
    setRobotMsg(hit.text);
    setRobotImg(hit.img);
    hitTimerRef.current = setTimeout(() => {
      const next = ROBOT_TIPS[(hitCount + 1) % ROBOT_TIPS.length];
      setRobotMode("normal");
      setRobotMsg(next.text);
      setRobotImg(next.img);
      startNormalRotation();
    }, HIT_DELAY);
  }

  async function doLogin() {
    if (!username.trim() || !password.trim()) {
      setErrorMsg("Please enter your username and password.");
      return;
    }
    setErrorMsg("");
    setLoading(true);
    try {
      const out = await apiClient("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      localStorage.setItem(AUTH_TOKEN_KEY, out.token as string);
      localStorage.setItem(ME_KEY, JSON.stringify(out.user));
      router.replace("/dashboard");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  if (!mounted) return null;

  return (
    <>
      <style>{`

        /* ════════════════════════════════════════
           KEYFRAMES
        ════════════════════════════════════════ */

        @keyframes ll-blobDrift {
          0%,100% { transform: translate(0,0)      scale(1);    }
          33%      { transform: translate(22px,-14px) scale(1.05); }
          66%      { transform: translate(-11px,18px) scale(0.97); }
        }

        /* Card entrance — subtle scale + rise */
        @keyframes ll-cardIn {
          from { opacity: 0; transform: translateY(22px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0)    scale(1);     }
        }

        @keyframes ll-leftIn {
          from { opacity: 0; transform: translateX(-22px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @keyframes ll-rightIn {
          from { opacity: 0; transform: translateX(22px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        /* ALOX idle — float + gentle rock + soft breathe (4.8 s cycle) */
        @keyframes ll-robotIdle {
          0%   { transform: translateY(0px)   rotate(0deg)    scale(1.000); }
          18%  { transform: translateY(-3px)  rotate(0.55deg) scale(1.006); }
          38%  { transform: translateY(-8px)  rotate(0deg)    scale(1.013); }
          58%  { transform: translateY(-5px)  rotate(-0.6deg) scale(1.007); }
          78%  { transform: translateY(-2px)  rotate(0.3deg)  scale(1.002); }
          100% { transform: translateY(0px)   rotate(0deg)    scale(1.000); }
        }

        /* Platform shadow — synced with ll-robotIdle */
        @keyframes ll-shadowSync {
          0%   { transform: translateX(-50%) scaleX(1)    scaleY(1);    opacity: 0.45; }
          38%  { transform: translateX(-50%) scaleX(0.70) scaleY(0.55); opacity: 0.18; }
          70%  { transform: translateX(-50%) scaleX(0.82) scaleY(0.72); opacity: 0.28; }
          100% { transform: translateX(-50%) scaleX(1)    scaleY(1);    opacity: 0.45; }
        }

        /* Concentric aura rings */
        @keyframes ll-ring1 {
          0%,100% { opacity: 0.38; transform: scale(1);    }
          50%      { opacity: 0.65; transform: scale(1.08); }
        }
        @keyframes ll-ring2 {
          0%,100% { opacity: 0.22; transform: scale(1);    }
          50%      { opacity: 0.45; transform: scale(1.13); }
        }
        @keyframes ll-ring3 {
          0%,100% { opacity: 0.1;  transform: scale(1);    }
          50%      { opacity: 0.24; transform: scale(1.22); }
        }

        /* Light-ray disk rotates very slowly */
        @keyframes ll-rayRotate {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(360deg); }
        }

        /* Particles drift upward and fade */
        @keyframes ll-particleFly {
          0%   { opacity: 0;    transform: translateY(0)     scale(0.5);  }
          20%  { opacity: 0.85; }
          80%  { opacity: 0.65; }
          100% { opacity: 0;    transform: translateY(-88px) scale(1.25); }
        }

        /* Button ripple from centre */
        @keyframes ll-ripple {
          from { transform: translate(-50%,-50%) scale(0); opacity: 0.45; }
          to   { transform: translate(-50%,-50%) scale(8); opacity: 0;    }
        }

        /* Loading shimmer sweep */
        @keyframes ll-btnScan {
          from { left: -55%; }
          to   { left: 130%; }
        }

        @keyframes ll-spin {
          to { transform: rotate(360deg); }
        }

        @keyframes ll-bubblePop {
          from { opacity: 0; transform: scale(0.86) translateY(6px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }

        @keyframes ll-errorIn {
          from { opacity: 0; transform: translateY(-5px); }
          to   { opacity: 1; transform: translateY(0);    }
        }


        /* ════════════════════════════════════════
           PAGE
        ════════════════════════════════════════ */

        .ll-root {
          min-height: 100vh;
          background:
            radial-gradient(ellipse 70% 55% at 15%  0%,  rgba(16,185,129,0.09) 0%, transparent 55%),
            radial-gradient(ellipse 55% 60% at 88% 95%,  rgba(20,184,166,0.08) 0%, transparent 55%),
            radial-gradient(ellipse 45% 45% at 55% 48%,  rgba(16,185,129,0.04) 0%, transparent 50%),
            #f8fafc;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        /* Ambient drifting blobs */
        .ll-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          will-change: transform;
        }
        .ll-blob-1 {
          width: 580px; height: 580px;
          background: radial-gradient(circle, rgba(16,185,129,0.14) 0%, transparent 62%);
          top: -150px; left: -130px;
          animation: ll-blobDrift 20s ease-in-out infinite;
        }
        .ll-blob-2 {
          width: 440px; height: 440px;
          background: radial-gradient(circle, rgba(20,184,166,0.1) 0%, transparent 62%);
          bottom: -100px; right: -100px;
          animation: ll-blobDrift 25s ease-in-out infinite reverse;
        }
        .ll-blob-3 {
          width: 320px; height: 320px;
          background: radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 62%);
          top: 52%; left: 62%;
          animation: ll-blobDrift 32s ease-in-out infinite 8s;
        }


        /* ════════════════════════════════════════
           MAIN CARD
        ════════════════════════════════════════ */

        .ll-wrapper {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 980px;
          display: flex;
          background: #ffffff;
          border-radius: 24px;
          overflow: hidden;
          /* Layered premium shadow: contact → ambient → depth → green-tint */
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.04),
            0 1px 0  rgba(255,255,255,0.9) inset,
            0 2px 4px   rgba(0,0,0,0.04),
            0 8px 24px  rgba(0,0,0,0.07),
            0 28px 70px rgba(0,0,0,0.12),
            0 52px 100px rgba(16,185,129,0.05);
          animation: ll-cardIn 0.6s cubic-bezier(0.22,1,0.36,1) forwards;
        }


        /* ════════════════════════════════════════
           LEFT — LOGIN FORM
        ════════════════════════════════════════ */

        .ll-left {
          flex: 0 0 50%;
          padding: 60px 56px;
          display: flex;
          flex-direction: column;
          animation: ll-leftIn 0.55s cubic-bezier(0.22,1,0.36,1) 0.08s both;
        }

        /* Brand */
        .ll-brand {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-bottom: 52px;
        }

        .ll-brand-logo {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          object-fit: contain;
          flex-shrink: 0;
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.06),
            0 2px 6px rgba(0,0,0,0.1);
        }

        .ll-brand-name {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.2;
          letter-spacing: -0.2px;
        }

        .ll-brand-sub {
          font-size: 11px;
          font-weight: 500;
          color: #94a3b8;
          margin-top: 2px;
        }

        /* Heading */
        .ll-heading {
          font-size: 28px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.7px;
          margin: 0 0 6px;
        }

        .ll-subheading {
          font-size: 14px;
          color: #94a3b8;
          font-weight: 500;
          margin: 0 0 30px;
        }

        /* Error */
        .ll-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 10px 14px;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: ll-errorIn 200ms ease;
        }

        /* Fields */
        .ll-field { margin-bottom: 16px; }

        .ll-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 6px;
          user-select: none;
          cursor: default;
        }

        /* Input wrapper — inset shadow gives depth */
        .ll-input-wrap {
          display: flex;
          align-items: center;
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
          transition:
            border-color    220ms ease,
            background      220ms ease,
            box-shadow      220ms ease;
          box-shadow:
            inset 0 1px 3px rgba(0,0,0,0.05),
            0 1px 2px rgba(0,0,0,0.03);
        }

        .ll-input-wrap:focus-within {
          border-color: #10b981;
          background: #ffffff;
          box-shadow:
            inset 0 1px 2px rgba(0,0,0,0.02),
            0 0 0 3px rgba(16,185,129,0.13),
            0 1px 3px rgba(0,0,0,0.04);
        }

        .ll-input-wrap.has-error {
          border-color: #fca5a5;
          box-shadow:
            inset 0 1px 3px rgba(0,0,0,0.04),
            0 0 0 3px rgba(239,68,68,0.08);
        }

        .ll-input-icon {
          padding: 0 12px;
          font-size: 15px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          opacity: 0.4;
          transition: opacity 220ms ease;
        }

        .ll-input-wrap:focus-within .ll-input-icon {
          opacity: 0.72;
        }

        .ll-input {
          flex: 1;
          padding: 12px 8px 12px 0;
          font-size: 14px;
          font-family: inherit;
          border: none;
          outline: none;
          background: transparent;
          color: #0f172a;
          min-width: 0;
        }

        .ll-input::placeholder { color: #cbd5e1; }

        .ll-input-btn {
          padding: 0 13px;
          height: 44px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 11px;
          font-weight: 700;
          font-family: inherit;
          color: #94a3b8;
          flex-shrink: 0;
          letter-spacing: 0.35px;
          text-transform: uppercase;
          transition: color 150ms;
        }
        .ll-input-btn:hover { color: #10b981; }

        /* Sign-In button */
        .ll-submit {
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, #059669 0%, #10b981 60%, #34d399 100%);
          background-size: 200% 200%;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition:
            transform    180ms cubic-bezier(0.34,1.56,0.64,1),
            box-shadow   180ms ease,
            background-position 400ms ease;
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.15) inset,
            0 2px 8px  rgba(16,185,129,0.22),
            0 6px 20px rgba(16,185,129,0.18);
          position: relative;
          overflow: hidden;
          letter-spacing: 0.1px;
        }

        /* Top-left diagonal highlight */
        .ll-submit::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 50%);
          border-radius: inherit;
          pointer-events: none;
          transition: opacity 200ms;
        }

        /* Ripple element — activated by :active */
        .ll-submit::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          width: 20px;
          height: 20px;
          background: rgba(255,255,255,0.42);
          border-radius: 50%;
          transform: translate(-50%,-50%) scale(0);
          opacity: 0;
          pointer-events: none;
        }

        .ll-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.15) inset,
            0 4px 16px rgba(16,185,129,0.32),
            0 10px 32px rgba(16,185,129,0.22);
          background-position: right center;
        }

        /* Realistic press: scale + slight down movement */
        .ll-submit:active:not(:disabled) {
          transform: scale(0.968) translateY(1px);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.1) inset,
            0 1px 4px rgba(16,185,129,0.18),
            0 2px 8px  rgba(16,185,129,0.12);
          transition: transform 60ms ease, box-shadow 60ms ease;
        }

        .ll-submit:active:not(:disabled)::after {
          animation: ll-ripple 550ms cubic-bezier(0.2,0.8,0.3,1) forwards;
        }

        .ll-submit:disabled {
          opacity: 0.62;
          cursor: not-allowed;
        }

        /* Spinner */
        .ll-spinner {
          width: 15px;
          height: 15px;
          border: 2px solid rgba(255,255,255,0.32);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: ll-spin 0.72s linear infinite;
          flex-shrink: 0;
        }

        /* Loading shimmer scan (appears inside button when loading) */
        .ll-btn-scan {
          position: absolute;
          top: 0;
          left: -55%;
          width: 45%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255,255,255,0.22) 50%,
            transparent 100%
          );
          border-radius: inherit;
          animation: ll-btnScan 1.25s linear infinite;
          pointer-events: none;
        }

        /* Footer */
        .ll-footer {
          margin-top: auto;
          padding-top: 30px;
          font-size: 11px;
          color: #cbd5e1;
          text-align: center;
          letter-spacing: 0.1px;
        }


        /* ════════════════════════════════════════
           RIGHT — ALOX HERO
        ════════════════════════════════════════ */

        .ll-right {
          flex: 0 0 50%;
          background:
            radial-gradient(ellipse at 30%  0%,  rgba(16,185,129,0.14) 0%, transparent 45%),
            radial-gradient(ellipse at 80% 100%,  rgba(20,184,166,0.1)  0%, transparent 40%),
            linear-gradient(158deg, #f0fdf4 0%, #f7fef9 50%, #ecfdf5 100%);
          border-left: 1px solid rgba(16,185,129,0.1);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 56px 44px;
          position: relative;
          overflow: hidden;
          animation: ll-rightIn 0.55s cubic-bezier(0.22,1,0.36,1) 0.08s both;
        }

        /* Dot grid */
        .ll-right-dots {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(16,185,129,0.22) 1.5px, transparent 1.5px);
          background-size: 26px 26px;
          pointer-events: none;
          opacity: 0.5;
        }

        /* Large soft radial glow behind ALOX */
        .ll-right-glow {
          position: absolute;
          top: 40%;
          left: 50%;
          width: 380px;
          height: 380px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 58%);
          border-radius: 50%;
          pointer-events: none;
        }

        /* Rotating light-ray conic disk */
        .ll-rays {
          position: absolute;
          top: 40%;
          left: 50%;
          width: 340px;
          height: 340px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,     rgba(16,185,129,0.055) 18deg,
            transparent 36deg,    rgba(16,185,129,0.04)  54deg,
            transparent 72deg,    rgba(16,185,129,0.06)  90deg,
            transparent 108deg,   rgba(16,185,129,0.04)  126deg,
            transparent 144deg,   rgba(16,185,129,0.055) 162deg,
            transparent 180deg,   rgba(16,185,129,0.04)  198deg,
            transparent 216deg,   rgba(16,185,129,0.06)  234deg,
            transparent 252deg,   rgba(16,185,129,0.04)  270deg,
            transparent 288deg,   rgba(16,185,129,0.055) 306deg,
            transparent 324deg,   rgba(16,185,129,0.04)  342deg,
            transparent 360deg
          );
          mask-image: radial-gradient(circle, rgba(0,0,0,0.75) 0%, transparent 68%);
          -webkit-mask-image: radial-gradient(circle, rgba(0,0,0,0.75) 0%, transparent 68%);
          animation: ll-rayRotate 42s linear infinite;
          pointer-events: none;
        }

        /* Floating particles */
        .ll-particle {
          position: absolute;
          border-radius: 50%;
          background: rgba(16,185,129,0.7);
          pointer-events: none;
          animation: ll-particleFly linear infinite;
          box-shadow: 0 0 4px rgba(16,185,129,0.5);
        }

        /* ALOX section */
        .ll-alox-area {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* Speech bubble */
        .ll-bubble {
          background: #ffffff;
          border: 1.5px solid #d1fae5;
          color: #065f46;
          padding: 11px 18px;
          border-radius: 14px 14px 14px 4px;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
          max-width: 244px;
          line-height: 1.46;
          box-shadow:
            0 2px 8px rgba(16,185,129,0.1),
            0 8px 24px rgba(16,185,129,0.06);
          animation: ll-bubblePop 320ms cubic-bezier(0.34,1.56,0.64,1);
          margin-bottom: 24px;
        }

        .ll-bubble.is-hit {
          background: #fff5f5;
          border-color: #fecaca;
          color: #dc2626;
          box-shadow:
            0 2px 8px rgba(239,68,68,0.1),
            0 8px 24px rgba(239,68,68,0.06);
        }

        /* Glow wrap — houses rings + robot + shadow */
        .ll-glow-wrap {
          position: relative;
          width: 220px;
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Concentric aura rings (border + fill) */
        .ll-ring {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }

        .ll-ring-1 {
          width: 220px;
          height: 220px;
          border: 1px solid rgba(16,185,129,0.18);
          background: radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 68%);
          animation: ll-ring3 5.8s ease-in-out infinite;
        }

        .ll-ring-2 {
          width: 175px;
          height: 175px;
          border: 1px solid rgba(16,185,129,0.24);
          background: radial-gradient(circle, rgba(16,185,129,0.14) 0%, transparent 68%);
          animation: ll-ring2 4.2s ease-in-out infinite 0.8s;
        }

        .ll-ring-3 {
          width: 130px;
          height: 130px;
          border: 1px solid rgba(16,185,129,0.38);
          background: radial-gradient(circle, rgba(16,185,129,0.28) 0%, transparent 68%);
          animation: ll-ring1 3.1s ease-in-out infinite 1.5s;
        }

        /* ALOX robot — idle animation: float + rock + breathe */
        .ll-robot-btn {
          position: relative;
          z-index: 2;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: ll-robotIdle 4.8s ease-in-out infinite;
          transition: filter 180ms ease;
        }

        .ll-robot-btn:hover {
          filter: drop-shadow(0 8px 20px rgba(16,185,129,0.35));
        }

        .ll-robot-btn:active {
          animation-play-state: paused;
          filter: drop-shadow(0 2px 8px rgba(16,185,129,0.25));
        }

        /* Platform shadow — fades & shrinks as robot floats up */
        .ll-platform-shadow {
          position: absolute;
          bottom: -8px;
          left: 50%;
          width: 88px;
          height: 16px;
          background: radial-gradient(ellipse at center, rgba(16,185,129,0.42) 0%, transparent 68%);
          border-radius: 50%;
          animation: ll-shadowSync 4.8s ease-in-out infinite;
          pointer-events: none;
        }

        /* ALOX label */
        .ll-alox-name {
          margin-top: 14px;
          font-size: 11px;
          font-weight: 800;
          color: #059669;
          letter-spacing: 3.5px;
          text-transform: uppercase;
          opacity: 0.72;
        }

        /* Company footer info */
        .ll-company-info {
          margin-top: 36px;
          text-align: center;
          z-index: 1;
        }

        .ll-company-name {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.2px;
        }

        .ll-company-sub {
          font-size: 12px;
          color: #94a3b8;
          margin-top: 3px;
          font-weight: 500;
        }


        /* ════════════════════════════════════════
           RESPONSIVE
        ════════════════════════════════════════ */

        @media (max-width: 780px) {
          .ll-wrapper {
            flex-direction: column;
            max-width: 480px;
          }
          .ll-left {
            flex: none;
            padding: 40px 36px 36px;
            border-bottom: 1px solid #f1f5f9;
          }
          .ll-right {
            flex: none;
            padding: 36px 28px;
            border-left: none;
            border-top: 1px solid rgba(16,185,129,0.1);
          }
          .ll-brand { margin-bottom: 32px; }
          .ll-heading { font-size: 24px; }
          .ll-glow-wrap { width: 172px; height: 172px; }
          .ll-ring-1 { width: 172px; height: 172px; }
          .ll-ring-2 { width: 137px; height: 137px; }
          .ll-ring-3 { width: 102px; height: 102px; }
          .ll-rays   { width: 260px; height: 260px; }
        }

        @media (max-width: 520px) {
          .ll-root  { padding: 14px; }
          .ll-left  { padding: 30px 24px 26px; }
          .ll-right { padding: 28px 20px; }
          .ll-heading { font-size: 22px; }
          .ll-brand { margin-bottom: 26px; }
        }

      `}</style>

      <main className="ll-root">

        {/* ── Ambient background blobs ── */}
        <div className="ll-blob ll-blob-1" />
        <div className="ll-blob ll-blob-2" />
        <div className="ll-blob ll-blob-3" />

        <div className="ll-wrapper">

          {/* ══════════════════════════════
              LEFT — Login Form
          ══════════════════════════════ */}
          <div className="ll-left">

            <div className="ll-brand">
              <Image
                src="/F1NAL.jpg"
                alt="ALGO GROUP"
                width={42}
                height={42}
                className="ll-brand-logo"
              />
              <div>
                <div className="ll-brand-name">ALGO GROUP LLC</div>
                <div className="ll-brand-sub">Zero Violations Dashboard</div>
              </div>
            </div>

            <h1 className="ll-heading">Welcome back</h1>
            <p className="ll-subheading">Sign in to your dashboard</p>

            {errorMsg && (
              <div className="ll-error">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="ll-field">
              <Label.Root className="ll-label" htmlFor="zv-user">Username</Label.Root>
              <div className={`ll-input-wrap${errorMsg ? " has-error" : ""}`}>
                <span className="ll-input-icon">👤</span>
                <input
                  id="zv-user"
                  className="ll-input"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setErrorMsg(""); }}
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && doLogin()}
                  disabled={loading}
                />
                {username && (
                  <button
                    className="ll-input-btn"
                    onClick={() => setUsername("")}
                    type="button"
                    tabIndex={-1}
                    aria-label="Clear username"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="ll-field">
              <Label.Root className="ll-label" htmlFor="zv-pass">Password</Label.Root>
              <div className={`ll-input-wrap${errorMsg ? " has-error" : ""}`}>
                <span className="ll-input-icon">🔒</span>
                <input
                  id="zv-pass"
                  className="ll-input"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(""); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  onKeyDown={(e) => e.key === "Enter" && doLogin()}
                  disabled={loading}
                />
                <button
                  className="ll-input-btn"
                  onClick={() => setShowPass((s) => !s)}
                  type="button"
                  tabIndex={-1}
                >
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              className="ll-submit"
              onClick={doLogin}
              disabled={loading}
              type="button"
            >
              {loading ? (
                <>
                  <span className="ll-spinner" />
                  Signing in…
                  <span className="ll-btn-scan" />
                </>
              ) : "Sign In →"}
            </button>

            <div className="ll-footer">
              ALGO GROUP LLC © {new Date().getFullYear()} · Zero Violations Platform
            </div>
          </div>

          {/* ══════════════════════════════
              RIGHT — ALOX Hero
          ══════════════════════════════ */}
          <div className="ll-right">

            {/* Background layers */}
            <div className="ll-right-dots" />
            <div className="ll-right-glow" />
            <div className="ll-rays" />

            {/* Floating particles */}
            {PARTICLES.map((p) => (
              <div
                key={p.id}
                className="ll-particle"
                style={{
                  left:                    `${p.x}%`,
                  top:                     `${p.y}%`,
                  width:                   `${p.size}px`,
                  height:                  `${p.size}px`,
                  animationDuration:       `${p.dur}s`,
                  animationDelay:          `${p.delay}s`,
                }}
              />
            ))}

            {/* ALOX section */}
            <div className="ll-alox-area">

              {/* Speech bubble — re-mounts on message change for pop animation */}
              <div
                key={robotMsg}
                className={`ll-bubble${robotMode === "hit" ? " is-hit" : ""}`}
              >
                {(() => {
                  // Messages start with an emoji: show it in its own badge, then the text.
                  const [icon, ...words] = robotMsg.split(" ");
                  return (
                    <>
                      <span className="ll-bubble-icon" aria-hidden>{icon}</span>
                      <span className="ll-bubble-text">{words.join(" ")}</span>
                    </>
                  );
                })()}
              </div>

              {/* Glow wrap: rings + robot + shadow */}
              <div className="ll-glow-wrap">
                <div className="ll-ring ll-ring-1" />
                <div className="ll-ring ll-ring-2" />
                <div className="ll-ring ll-ring-3" />

                <button
                  onClick={handleRobotHit}
                  type="button"
                  className="ll-robot-btn"
                  title="Click Alox"
                  aria-label="Click Alox"
                >
                  <Image
                    key={robotImg}
                    src={`${robotImg}?v=3`}
                    alt="Alox"
                    width={150}
                    height={150}
                    priority
                    unoptimized
                    style={{ objectFit: "contain" }}
                  />
                </button>

                {/* Cast shadow — shrinks when robot floats up */}
                <div className="ll-platform-shadow" />

                <button
                  type="button"
                  className="ll-sound-btn"
                  onClick={() => { const next = !soundOn; setSoundOn(next); setRobotSoundEnabled(next); }}
                  title={soundOn ? "Mute Alox" : "Unmute Alox"}
                  aria-label={soundOn ? "Mute Alox" : "Unmute Alox"}
                  aria-pressed={!soundOn}
                >
                  {soundOn ? "🔊" : "🔇"}
                </button>
              </div>

              <div className="ll-alox-name">ALOX</div>
            </div>

            <div className="ll-company-info">
              <div className="ll-company-name">ALGO GROUP LLC</div>
              <div className="ll-company-sub">Zero Violations Platform</div>
            </div>

          </div>
        </div>
      </main>
    </>
  );
}
