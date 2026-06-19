"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { X, Send, BookOpen, ChevronDown, ChevronUp } from "lucide-react";

type ChatMessage = {
  role: "user" | "alox";
  text: string;
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

const QUESTION_GROUPS = [
  {
    title: "Performance",
    questions: [
      "Which block is performing best?",
      "Which block needs attention?",
      "Show current leaderboard",
      "What is the average KPI?",
      "Which blocks are perfect?",
      "Show top 3 blocks",
      "Show weakest block",
    ],
  },
  {
    title: "Summary",
    questions: [
      "Give me dashboard summary",
      "What happened this month?",
      "Show June summary",
      "Show active blocks",
      "Show violation ranking",
      "Which block has most violations?",
    ],
  },
  {
    title: "Pages",
    questions: [
      "Explain dashboard page",
      "Explain reports page",
      "Explain analytics page",
      "Explain admin page",
      "What can I edit?",
      "How is ranking calculated?",
    ],
  },
  {
    title: "About",
    questions: [
      "Who are you?",
      "What can you answer?",
      "How can you help me?",
    ],
  },
];

export default function AloxChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "alox", text: "Hello, I am Alox. I can answer questions about your dashboard data." },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
      const res = await fetch("/api/alox-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "alox", text: data.reply || data.error || "Alox could not answer this question yet." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "alox", text: "Connection error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="alox-trigger">
          <Image src="/alox/alox-neutral.png" alt="" width={22} height={22} className="alox-trigger-avatar" />
          <span>Alox Chat</span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="alox-panel" aria-describedby={undefined}>
          {/* Header */}
          <div className="alox-header">
            <div className="alox-header-identity">
              <Image src="/alox/alox-neutral.png" alt="" width={36} height={36} className="alox-chat-avatar" />
              <div>
                <Dialog.Title className="alox-title">Alox Chat</Dialog.Title>
                <p className="alox-subtitle">KPI adviser assistant</p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Close">
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          {/* Messages */}
          <ScrollArea.Root className="alox-messages scroll-area-root">
            <ScrollArea.Viewport className="alox-messages-viewport scroll-area-viewport">
              {messages.map((msg, i) => (
                <div key={i} className={`alox-msg alox-msg-${msg.role}`}>
                  {msg.text}
                </div>
              ))}
              {loading && (
                <div className="alox-msg alox-msg-alox alox-msg-loading">
                  Alox is checking data…
                </div>
              )}
              <div ref={bottomRef} />
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical" className="scroll-area-scrollbar">
              <ScrollArea.Thumb className="scroll-area-thumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>

          {/* Questions Library */}
          <div className="alox-library">
            <button
              type="button"
              className={`alox-library-toggle${libraryOpen ? " alox-library-open" : ""}`}
              onClick={() => setLibraryOpen((v) => !v)}
            >
              <BookOpen size={13} />
              <span>Questions Alox Can Answer</span>
              {libraryOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {libraryOpen && (
              <div className="alox-library-body">
                {QUESTION_GROUPS.map((group) => (
                  <div key={group.title}>
                    <div className="alox-question-group-title">{group.title}</div>
                    <div className="alox-question-chips">
                      {group.questions.map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="alox-chip"
                          onClick={() => sendMessage(q)}
                          disabled={loading}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="alox-input-area">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ask Alox…"
              disabled={loading}
              className="alox-input"
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="btn btn-primary"
              style={{ padding: "9px 14px" }}
            >
              <Send size={14} />
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
