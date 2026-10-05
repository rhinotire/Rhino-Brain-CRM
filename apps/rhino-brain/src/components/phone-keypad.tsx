"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { PhoneDialer } from "@/components/phone-dialer";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "✚1", "0", "⌫"] as const;

/** "4077775598" → "(407) 777-5598" while typing; longer inputs stay raw. */
function fmt(digits: string): string {
  const d = digits.startsWith("1") && digits.length > 10 ? digits.slice(1) : digits;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return digits;
}

/** Standalone dial pad — call any US/CA number, not just saved customers. */
export function PhoneKeypad() {
  const [digits, setDigits] = useState("");
  const valid = digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));

  const press = (k: string) => {
    if (k === "⌫") setDigits(d => d.slice(0, -1));
    else if (k === "✚1") setDigits(d => (d.startsWith("1") ? d : "1" + d).slice(0, 11));
    else setDigits(d => (d + k).slice(0, 11));
  };

  return (
    <div className="mx-auto w-full max-w-xs space-y-3">
      <input
        type="tel"
        inputMode="tel"
        value={fmt(digits)}
        onChange={e => setDigits(e.target.value.replace(/\D/g, "").slice(0, 11))}
        placeholder="(407) 555-1234"
        className="w-full rounded-xl border border-slate-300 px-3 py-3 text-center text-2xl font-semibold tracking-wide tabular-nums focus:border-brand-500 focus:outline-none"
      />
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map(k => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="h-14 rounded-xl bg-slate-100 text-xl font-semibold text-slate-800 transition-colors hover:bg-slate-200 active:bg-slate-300"
          >
            {k}
          </button>
        ))}
      </div>
      {valid ? (
        // key resets the dialer when the number changes mid-idle
        <PhoneDialer key={digits} phone={digits} enabled size="md" className="h-12 w-full text-base" label={`Call ${fmt(digits)}`} />
      ) : (
        <Button size="md" variant="success" className="h-12 w-full text-base" disabled>
          🎧 Call
        </Button>
      )}
      <p className="text-center text-xs text-slate-400">
        Calls show (689) 254-0988 to the customer and are logged automatically.
      </p>
    </div>
  );
}
