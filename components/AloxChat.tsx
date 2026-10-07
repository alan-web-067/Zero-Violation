"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Send, RotateCcw, ArrowRight, Sparkles } from "lucide-react";
import { apiClient, ME_KEY } from "@/lib/apiClient";

type ChatLink = { href: string; label: string };

type ChatMessage = {
  role: "user" | "alox";
  text: string;
  link?: ChatLink | null;
  suggestions?: string[];
  error?: boolean;
};

// PHASE1 FEATURE — lets other pages (e.g. the Dashboard's "Ask Alox"
// quick-link buttons) open this chat with a pre-filled question, without
// needing to control the dialog's state directly. Mirrors the same-tab
// CustomEvent pattern already used by ALOX_VISIBILITY_EVENT in
// components/AloxHelpButton.tsx. Safe to remove: with no listener this is
// inert, and removing the listener below makes it inert from this side too.
export const ALOX_ASK_QUESTION_EVENT = "zv-alox-ask-question";
export const ALOX_OPEN_CHAT_EVENT = "zv-alox-open-chat";

export function askAlox(question: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ question: string }>(ALOX_ASK_QUESTION_EVENT, { detail: { question } }));
}

export function openAloxChat() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ALOX_OPEN_CHAT_EVENT));
}

const QUESTION_GROUPS: Array<{ title: string; questions: string[] }> = [
  {
    title: "Performance",
    questions: [
      "Which block is performing best?",
      "Which block needs attention?",
      "Show top 3 blocks",
      "Show current leaderboard",
      "Which blocks are perfect?",
      "What is the average KPI?",
      "Which block has most violations?",
    ],
  },
  {
    title: "Trends & awards",
    questions: [
      "Who is Team of the Year?",
      "Who climbed the most?",
      "Give me dashboard summary",
      "Show violation ranking",
      "Show active blocks",
    ],
  },
  {
    title: "How it works",
    questions: [
      "How is the KPI calculated?",
      "What can I edit?",
      "Explain Hall of Fame",
      "Explain block profile",
      "Explain My Workspace",
      "Explain reports page",
    ],
  },
];

const STARTERS = [
  { icon: "🏆", q: "Which block is performing best?" },
  { icon: "⚠️", q: "Which block needs attention?" },
  { icon: "🚀", q: "Who climbed the most?" },
  { icon: "🏛️", q: "Who is Team of the Year?" },
];

const HISTORY_KEY = "zv_alox_history";
const MAX_HISTORY = 40;

function loadHistory(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(list) ? list.slice(-MAX_HISTORY) : [];
  } catch { return []; }
}

function firstName(): string {
  try {
    const me = JSON.parse(localStorage.getItem(ME_KEY) ?? "null");
    return typeof me?.username === "string" ? me.username : "";
  } catch { return ""; }
}

// Plain-text answers → paragraphs and bullet/numbered lists.
function AloxText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{it}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    const num = t.match(/^\d+\.\s+(.*)$/);
    const bullet = t.match(/^[-•]\s+(.*)$/);
    if (num || bullet) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((num ?? bullet)![1]);
    } else {
      flush();
      blocks.push(<p key={blocks.length}>{t}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

export default function AloxChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => (typeof window === "undefined" ? [] : loadHistory()));
  const [period, setPeriod] = useState<string | null>(null);
  const [name] = useState(() => (typeof window === "undefined" ? "" : firstName()));
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  useEffect(() => {
    try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_HISTORY))); } catch { /* storage unavailable */ }
  }, [messages]);

  // PHASE1 FEATURE — opens this panel and sends the pre-filled question when
  // another page asks Alox something on the user's behalf (see askAlox /
  // ALOX_ASK_QUESTION_EVENT above). Re-subscribes on `loading` so the guard
  // below always sees the current value.
  useEffect(() => {
    function onAskQuestion(e: Event) {
      const detail = (e as CustomEvent<{ question: string }>).detail;
      if (!detail?.question || loading) return;
      setOpen(true);
      setTimeout(() => sendMessage(detail.question), 80);
    }
    window.addEventListener(ALOX_ASK_QUESTION_EVENT, onAskQuestion as EventListener);
    return () => window.removeEventListener(ALOX_ASK_QUESTION_EVENT, onAskQuestion as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Opens chat panel and focuses the input when triggered from the context
  // menu "Chat Alox" action (or any other caller using openAloxChat()).
  useEffect(() => {
    function onOpenChat() {
      setOpen(true);
      focusInput();
    }
    window.addEventListener(ALOX_OPEN_CHAT_EVENT, onOpenChat);
    return () => window.removeEventListener(ALOX_OPEN_CHAT_EVENT, onOpenChat);
  }, [focusInput]);

  async function sendMessage(text?: string) {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setInput("");
    setLibraryOpen(false);
    setLoading(true);

    try {
      const data = await apiClient("/api/alox-chat", {
        method: "POST",
        body: JSON.stringify({ message: userText }),
      });
      if (data.period) setPeriod(data.period);
      setMessages((prev) => [
        ...prev,
        {
          role: "alox",
          text: data.reply || "Alox could not answer this question yet.",
          link: data.link ?? null,
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "alox", error: true, text: err instanceof Error && err.message ? err.message : "Connection error. Please try again." },
      ]);
    } finally {
      setLoading(false);
      focusInput();
    }
  }

  function clearChat() {
    setMessages([]);
    setLibraryOpen(false);
    focusInput();
  }

  const lastAlox = [...messages].reverse().find((m) => m.role === "alox");
  const empty = messages.length === 0;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { setOpen(v); if (v) focusInput(); }}>
      <Dialog.Trigger asChild>
        <button type="button" className="alox-trigger">
          <Image src="/alox/alox-neutral.png" alt="" width={22} height={22} className="alox-trigger-avatar" />
          <span>Alox Chat</span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay ax-overlay" />
        <Dialog.Content className="alox-panel ax-panel" aria-describedby={undefined}>
          {/* Header */}
          <div className="ax-header">
            <div className="ax-avatar-wrap">
              <Image src="/alox/alox-neutral.png" alt="" width={40} height={40} className="ax-avatar" />
              <span className="ax-online" aria-hidden />
            </div>
            <div className="ax-heading">
              <Dialog.Title className="ax-title">Alox</Dialog.Title>
              <p className="ax-subtitle">{period ? `KPI assistant · data: ${period}` : "KPI assistant · always on"}</p>
            </div>
            {!empty && (
              <button type="button" className="ax-icon-btn" onClick={clearChat} title="New chat" aria-label="New chat">
                <RotateCcw size={15} />
              </button>
            )}
            <Dialog.Close asChild>
              <button type="button" className="ax-icon-btn" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Messages */}
          <div className="ax-scroll" ref={scrollRef}>
            {empty ? (
              <div className="ax-welcome">
                <div className="ax-welcome-badge"><Sparkles size={13} /> Ask about your blocks</div>
                <h3>Hi{name ? ` ${name}` : ""} 👋</h3>
                <p>I read the latest published results and answer questions about blocks, rankings, awards and how the score works.</p>
                <div className="ax-starters">
                  {STARTERS.map((s) => (
                    <button key={s.q} type="button" className="ax-starter" onClick={() => sendMessage(s.q)} disabled={loading}>
                      <span className="ax-starter-icon">{s.icon}</span>
                      <span>{s.q}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`ax-row ax-row-${msg.role}`}>
                  {msg.role === "alox" && (
                    <Image src="/alox/alox-neutral.png" alt="" width={26} height={26} className="ax-row-avatar" />
                  )}
                  <div className="ax-col">
                    <div className={`ax-bubble ax-bubble-${msg.role}${msg.error ? " ax-bubble-error" : ""}`}>
                      {msg.role === "alox" ? <AloxText text={msg.text} /> : msg.text}
                    </div>
                    {msg.role === "alox" && msg.link && (
                      <Link href={msg.link.href} className="ax-link" onClick={() => setOpen(false)}>
                        {msg.link.label} <ArrowRight size={13} />
                      </Link>
                    )}
                    {msg === lastAlox && !loading && msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="ax-followups">
                        {msg.suggestions.map((q) => (
                          <button key={q} type="button" className="ax-chip" onClick={() => sendMessage(q)}>{q}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="ax-row ax-row-alox">
                <Image src="/alox/alox-neutral.png" alt="" width={26} height={26} className="ax-row-avatar" />
                <div className="ax-bubble ax-bubble-alox ax-typing" aria-label="Alox is typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          {/* Questions library */}
          {libraryOpen && (
            <div className="ax-library">
              <div className="ax-tabs" role="tablist">
                {QUESTION_GROUPS.map((g, i) => (
                  <button key={g.title} type="button" role="tab" aria-selected={libraryTab === i}
                    className={`ax-tab${libraryTab === i ? " active" : ""}`} onClick={() => setLibraryTab(i)}>
                    {g.title}
                  </button>
                ))}
              </div>
              <div className="ax-library-chips">
                {QUESTION_GROUPS[libraryTab].questions.map((q) => (
                  <button key={q} type="button" className="ax-chip" onClick={() => sendMessage(q)} disabled={loading}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="ax-composer">
            <button
              type="button"
              className={`ax-library-btn${libraryOpen ? " active" : ""}`}
              onClick={() => setLibraryOpen((v) => !v)}
              title="Question ideas"
              aria-label="Question ideas"
              aria-expanded={libraryOpen}
            >
              <Sparkles size={16} />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
              placeholder="Ask Alox anything about your blocks…"
              disabled={loading}
              className="ax-input"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="ax-send"
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </div>
          <div className="ax-footnote">Answers use published results only.</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
