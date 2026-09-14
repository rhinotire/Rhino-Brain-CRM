"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mergeCustomers, cleanEmptyDuplicates } from "@/actions/customer-merge";
import { Button, Card, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export type DupRecord = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  phone: string | null;
  city: string | null;
  createdAt: string;
  counts: { label: string; n: number }[];
  total: number; // sum of related records
};
export type DupGroup = { key: string; name: string; locationName: string; records: DupRecord[] };

export function CleanEmptyButton({ emptyCount }: { emptyCount: number }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  if (emptyCount === 0) return null;
  return confirming ? (
    <span className="flex items-center gap-2">
      <span className="text-sm text-slate-600">Delete {emptyCount} empty duplicate records? This cannot be undone.</span>
      <Button variant="danger" size="sm" disabled={pending}
        onClick={() => start(async () => {
          const r = await cleanEmptyDuplicates();
          if (r.ok) { toast(`Deleted ${r.deleted} empty duplicates across ${r.groups} groups`); router.refresh(); }
          else toast(r.error ?? "Failed", "error");
          setConfirming(false);
        })}>
        {pending ? "Cleaning…" : "Yes, delete them"}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={pending}>Cancel</Button>
    </span>
  ) : (
    <Button variant="secondary" onClick={() => setConfirming(true)}>
      🧹 Clean {emptyCount} empty clones (no history, safe)
    </Button>
  );
}

function GroupCard({ g }: { g: DupGroup }) {
  // default keeper: the record with the most history, then the oldest
  const best = [...g.records].sort((a, b) => b.total - a.total || a.createdAt.localeCompare(b.createdAt))[0];
  const [keeperId, setKeeperId] = useState(best.id);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const losers = g.records.filter(r => r.id !== keeperId);
  return (
    <Card className="border-amber-200">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-slate-800">{g.name} <span className="text-xs font-normal text-slate-400">· {g.locationName} · {g.records.length} records</span></div>
        <Button size="sm" disabled={pending}
          onClick={() => start(async () => {
            const r = await mergeCustomers(keeperId, losers.map(l => l.id));
            if (r.ok) { toast(`Merged — ${r.moved ?? 0} related records moved`); router.refresh(); }
            else toast(r.error ?? "Merge failed", "error");
          })}>
          {pending ? "Merging…" : `Merge ${losers.length} into selected`}
        </Button>
      </div>
      <div className="space-y-1.5">
        {g.records.map(r => (
          <label key={r.id} className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${r.id === keeperId ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <input type="radio" name={`keep-${g.key}`} checked={r.id === keeperId} onChange={() => setKeeperId(r.id)} />
            <span className="font-medium text-slate-800">{r.id === keeperId ? "KEEP" : "merge"}</span>
            <span className="text-slate-500">{[r.contactPerson, r.phone, r.city].filter(Boolean).join(" · ") || "no contact info"}</span>
            <span className="ml-auto flex flex-wrap gap-1">
              {r.counts.filter(c => c.n > 0).map(c => (
                <Badge key={c.label} className="bg-slate-100 text-slate-600">{c.n} {c.label}</Badge>
              ))}
              {r.total === 0 && <Badge className="bg-slate-100 text-slate-400">empty</Badge>}
            </span>
          </label>
        ))}
      </div>
    </Card>
  );
}

export function DuplicateGroups({ groups }: { groups: DupGroup[] }) {
  if (!groups.length) {
    return <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-8 text-center text-sm text-emerald-700">🎉 No duplicate customers — the archive is clean.</div>;
  }
  return <div className="space-y-3">{groups.map(g => <GroupCard key={g.key} g={g} />)}</div>;
}
