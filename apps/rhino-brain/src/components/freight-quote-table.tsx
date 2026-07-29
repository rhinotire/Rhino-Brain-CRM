"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { awardQuote, overrideQuote, resendQuote, resendConfirmation, updateShipmentStatus, checkRepliesNow } from "@/actions/freight";

const Q_BADGE: Record<string, string> = {
  SENT: "bg-slate-100 text-slate-500",
  QUOTED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-slate-200 text-slate-500 line-through",
  NEEDS_ATTENTION: "bg-amber-100 text-amber-800",
  SEND_FAILED: "bg-red-100 text-red-700",
};

type QuoteRow = {
  id: string; carrierName: string; status: string; price: number | null; transitDays: number | null;
  notes: string | null; rawReplyExcerpt: string | null; repliedAt: string | null; lastError: string | null;
};

export function CheckRepliesButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await checkRepliesNow(); router.refresh(); })}
      disabled={pending}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Checking…" : "📬 Check Replies"}
    </button>
  );
}

export function FreightQuoteTable({ shipmentStatus, awardedQuoteId, quotes }: {
  shipmentStatus: string; awardedQuoteId: string | null; quotes: QuoteRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setMsg("");
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "Action failed");
      router.refresh();
    });

  const priced = quotes.filter((q) => q.price !== null).map((q) => q.price!);
  const best = priced.length ? Math.min(...priced) : null;

  return (
    <div className="space-y-2">
      {msg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{msg}</div>}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="p-2">Carrier</th><th className="p-2">Status</th><th className="p-2">Price</th><th className="p-2">Transit</th><th className="p-2">Replied</th><th className="p-2">Notes</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <QuoteRowView key={q.id} q={q} isBest={q.price !== null && q.price === best} isAwarded={q.id === awardedQuoteId}
                canAward={shipmentStatus === "QUOTING" && q.status === "QUOTED"}
                expanded={expanded === q.id} onToggle={() => setExpanded(expanded === q.id ? null : q.id)}
                editing={editing === q.id} price={price} setPrice={setPrice}
                onEdit={() => { setEditing(q.id); setPrice(q.price?.toString() ?? ""); }}
                onSaveEdit={() => { const p = parseFloat(price); if (p > 0) act(() => overrideQuote(q.id, { price: p })); setEditing(null); }}
                onAward={(sendRegrets) => act(() => awardQuote(q.id, { sendRegrets }))}
                onResend={() => act(() => resendQuote(q.id))}
                pending={pending}
              />
            ))}
            {quotes.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">No quotes yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuoteRowView({ q, isBest, isAwarded, canAward, expanded, onToggle, editing, price, setPrice, onEdit, onSaveEdit, onAward, onResend, pending }: {
  q: QuoteRow; isBest: boolean; isAwarded: boolean; canAward: boolean; expanded: boolean; onToggle: () => void;
  editing: boolean; price: string; setPrice: (v: string) => void; onEdit: () => void; onSaveEdit: () => void;
  onAward: (sendRegrets: boolean) => void; onResend: () => void; pending: boolean;
}) {
  return (
    <>
      <tr className={`border-t border-slate-100 ${isAwarded ? "bg-emerald-50" : q.status === "NEEDS_ATTENTION" ? "bg-amber-50" : ""}`}>
        <td className="p-2 font-semibold">{q.carrierName}{isAwarded && " ✅"}</td>
        <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${Q_BADGE[q.status]}`}>{q.status}</span></td>
        <td className="p-2">
          {editing ? (
            <span className="flex items-center gap-1">
              $<input value={price} onChange={(e) => setPrice(e.target.value)} className="w-24 rounded border border-slate-300 p-1" />
              <button onClick={onSaveEdit} className="text-xs font-semibold text-emerald-700">Save</button>
            </span>
          ) : (
            <span className={isBest ? "font-bold text-emerald-700" : ""}>
              {q.price !== null ? `$${q.price.toLocaleString()}` : "—"}
              <button onClick={onEdit} className="ml-1 text-xs text-slate-400 hover:text-slate-700">✎</button>
            </span>
          )}
        </td>
        <td className="p-2">{q.transitDays !== null ? `${q.transitDays} days` : "—"}</td>
        <td className="p-2 text-xs text-slate-500">{q.repliedAt ? q.repliedAt.slice(0, 16).replace("T", " ") : "—"}</td>
        <td className="max-w-56 truncate p-2 text-xs text-slate-500">{q.lastError ?? q.notes ?? ""}</td>
        <td className="p-2 text-right">
          {q.rawReplyExcerpt && <button onClick={onToggle} className="mr-2 text-xs text-blue-600 hover:underline">{expanded ? "Hide" : "Reply"}</button>}
          {q.status === "SEND_FAILED" && <button onClick={onResend} disabled={pending} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50">Resend</button>}
          {canAward && (
            <button
              onClick={() => onAward(confirm("Also notify the other quoted carriers that this load is covered?\nOK = notify them, Cancel = no notice"))}
              disabled={pending}
              className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
            >Award</button>
          )}
        </td>
      </tr>
      {expanded && q.rawReplyExcerpt && (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={7} className="p-3"><pre className="whitespace-pre-wrap font-sans text-xs text-slate-600">{q.rawReplyExcerpt}</pre></td>
        </tr>
      )}
    </>
  );
}

export function ShipmentStatusButtons({ shipmentId, status, confirmationSent }: { shipmentId: string; status: string; confirmationSent: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (to: "PICKED_UP" | "DELIVERED" | "CANCELLED") =>
    start(async () => { await updateShipmentStatus(shipmentId, to); router.refresh(); });
  const resend = () => start(async () => { await resendConfirmation(shipmentId); router.refresh(); });

  return (
    <div className="flex gap-2">
      {status === "BOOKED" && !confirmationSent && <button onClick={resend} disabled={pending} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400">Resend Confirmation</button>}
      {status === "BOOKED" && <button onClick={() => go("PICKED_UP")} disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Mark Picked Up</button>}
      {status === "PICKED_UP" && <button onClick={() => go("DELIVERED")} disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Mark Delivered</button>}
      {(status === "QUOTING" || status === "BOOKED") && <button onClick={() => { if (confirm("Cancel this shipment?")) go("CANCELLED"); }} disabled={pending} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Cancel Shipment</button>}
    </div>
  );
}
