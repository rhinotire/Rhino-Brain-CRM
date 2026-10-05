"use client";

import { useState, useTransition } from "react";
import { askField } from "@/actions/ai";
import { Button, Input } from "@/components/ui/primitives";

const SUGGESTIONS = [
  "Which of my customers are overdue?",
  "Customers in Orlando I haven't visited in 30 days",
  "My Tier A customers with no contact in 2 weeks",
];

/** Field Mode AI ask box — answers from the rep's real customer data. */
export function FieldAsk({ enabled }: { enabled: boolean }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!enabled) return null;

  const ask = (question: string) => {
    if (!question.trim() || pending) return;
    setAnswer(null); setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("question", question);
      const r = await askField(null, fd);
      if (r.ok && r.answer) setAnswer(r.answer);
      else setError(r.error ?? "AI request failed");
    });
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2.5">
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); ask(q); }}>
        <Input placeholder="🤖 Ask AI — overdue customers? who's in Kissimmee? …"
          value={q} onChange={e => setQ(e.target.value)} className="bg-white" />
        <Button type="submit" size="sm" disabled={pending || !q.trim()} className="h-9 shrink-0">
          {pending ? "…" : "Ask"}
        </Button>
      </form>
      {!answer && !pending && !error && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button key={s} type="button" onClick={() => { setQ(s); ask(s); }}
              className="rounded-full border border-violet-200 bg-white px-2.5 py-0.5 text-xs text-violet-700 hover:bg-violet-100">
              {s}
            </button>
          ))}
        </div>
      )}
      {pending && <p className="mt-2 text-sm text-violet-600">Checking your customers…</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {answer && (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-3">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{answer}</pre>
          <button type="button" className="mt-1.5 text-xs text-slate-400 underline" onClick={() => { setAnswer(null); setQ(""); }}>
            clear
          </button>
        </div>
      )}
    </div>
  );
}
