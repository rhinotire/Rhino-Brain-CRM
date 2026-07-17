"use client";

import { useState, useTransition } from "react";
import { setMsrp } from "@/actions/products";
import { useToast } from "@/components/ui/toast";

/**
 * Inline MSRP editor. This is the ONLY price that ever shows on the public
 * website ("Reference price" for consumers); tier pricing stays internal.
 */
export function MsrpCell({ productId, msrp }: { productId: string; msrp: number | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number | null>(msrp);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  const save = (raw: string) => {
    setEditing(false);
    if (raw.trim() === (value === null ? "" : String(value))) return; // unchanged
    start(async () => {
      const res = await setMsrp(productId, raw);
      if (res.error) { toast(res.error, "error"); return; }
      setValue(res.msrp ?? null);
      toast(res.msrp === null ? "MSRP cleared — website shows no price" : `MSRP set to $${res.msrp!.toFixed(2)} — shows on the website in ~5 min`);
    });
  };

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={value === null ? "" : String(value)}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        inputMode="decimal"
        placeholder="empty = none"
        className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs tabular-nums"
        aria-label="MSRP"
      />
    );
  }

  return (
    <button type="button" onClick={() => { setText(""); setEditing(true); }} disabled={pending}
      title="Public reference price shown to consumers — click to edit"
      className={`rounded px-1.5 py-0.5 text-xs tabular-nums hover:bg-slate-100 ${value === null ? "text-slate-300" : "font-semibold text-slate-700"} disabled:opacity-50`}>
      {pending ? "…" : value === null ? "— set" : `$${value.toFixed(2)}`}
    </button>
  );
}
