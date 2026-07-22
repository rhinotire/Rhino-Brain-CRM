"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Do you have ST205/75R15 trailer tires in stock?",
  "How do I open a dealer account?",
  "What load range do I need for my trailer?",
];

/**
 * AI sales assistant chat (master instruction §12). Streams from
 * /api/assistant; the disclaimer + logging notice satisfy the consent and
 * fitment-safety requirements. Sits above the mobile sticky bar.
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const history: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        const msg = res.status === 429 || res.status === 503 ? await res.text() : "Sorry — something went wrong. Please try again or call us.";
        setMessages([...history, { role: "assistant", content: msg }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const current = acc;
        setMessages([...history, { role: "assistant", content: current }]);
      }
      if (!acc.trim()) {
        setMessages([...history, { role: "assistant", content: "Sorry — I didn't catch that. Please try again or call us." }]);
      }
    } catch {
      setMessages([...history, { role: "assistant", content: "Connection problem — please try again or call us." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {/* launcher — above the mobile sticky action bar */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant chat"
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-navy-900 px-4 py-3 text-sm font-bold text-white shadow-lift transition hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-brand sm:bottom-6 sm:right-6"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-brand stroke-2" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" strokeLinejoin="round" />
            <path d="M9 12h.01M13 12h.01M17 12h.01" strokeLinecap="round" />
          </svg>
          Ask about tires
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="AI sales assistant"
          className="fixed bottom-0 right-0 z-50 flex h-[85dvh] w-full flex-col border border-steel-200 bg-white shadow-lift sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[400px] sm:rounded-2xl"
        >
          <div className="flex items-center justify-between rounded-t-2xl bg-navy-900 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold">Tire &amp; Wheel Assistant</p>
              <p className="text-[11px] text-steel-300">AI · checks live stock · no pricing (quote-only)</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-1.5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current stroke-2" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-steel-500">
                  Ask about sizes, availability, dealer accounts, or installation. I check our live catalog — for pricing you&apos;ll
                  get a fast quote from our team.
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded-xl border border-steel-200 px-3 py-2 text-left text-sm text-navy-900 hover:border-brand hover:bg-brand/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <p key={i} className="ml-8 rounded-2xl rounded-br-md bg-navy-900 px-3 py-2 text-sm text-white">
                  {m.content}
                </p>
              ) : (
                <div key={i} className="assistant-md mr-4 text-sm leading-relaxed text-slate-800">
                  {m.content ? (
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} className="font-bold text-brand-dark underline underline-offset-2">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  ) : (
                    <span className="text-steel-400">…</span>
                  )}
                </div>
              )
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-steel-200 p-3"
          >
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. ST235/80R16 load range E"
                maxLength={2000}
                aria-label="Message the assistant"
                className="min-w-0 flex-1 rounded-xl border border-steel-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
              />
              <button
                disabled={busy || !input.trim()}
                className="rounded-xl bg-navy-900 px-4 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? "…" : "Send"}
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-snug text-steel-400">
              AI assistant — verify fitment, load capacity and pressure against vehicle, trailer, wheel and tire manufacturer
              specifications. Conversations may be logged to improve service.
            </p>
          </form>
        </div>
      )}
    </>
  );
}
