"use client";

import { useEffect } from "react";

/** Print toolbar for print-layout pages: button + optional auto-open of the
 * system print dialog. Hidden on paper via print:hidden. */
export function AutoPrint({ auto = false }: { auto?: boolean }) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [auto]);
  return (
    <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 print:hidden">
      <span className="text-xs text-slate-500">Print view — use your browser's print dialog to save as PDF.</span>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
      >
        🖨 Print
      </button>
    </div>
  );
}
