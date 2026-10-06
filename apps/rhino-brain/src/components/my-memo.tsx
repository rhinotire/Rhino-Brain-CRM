"use client";

import { useEffect, useRef, useState } from "react";
import { saveMyMemo } from "@/actions/memo";

/** Personal sticky-note pad on My Work — autosaves as you type, only you see it. */
export function MyMemo({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setState("saving");
    const t = setTimeout(() => {
      saveMyMemo(text)
        .then(() => { setState("saved"); setTimeout(() => setState("idle"), 1500); })
        .catch(() => setState("idle"));
    }, 800);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 shadow-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold text-yellow-900">📝 My Notes</span>
        <span className="text-xs text-yellow-700/60">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "autosaves · only you see this"}
        </span>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={5}
        maxLength={8000}
        placeholder={"Anything you need to remember today…\n- call the insurance agent back\n- forklift guy comes Thursday"}
        className="w-full resize-y rounded-md border border-yellow-200 bg-white/70 p-2.5 text-sm leading-relaxed text-slate-800 placeholder:text-yellow-700/40 focus:border-yellow-400 focus:outline-none"
      />
    </div>
  );
}
