"use client";

import { useRouter } from "next/navigation";

/** Date picker + rep filter for the field daily report (manager view). */
export function FieldReportFilters({ date, rep, reps }: {
  date: string;
  rep: string;
  reps: { id: string; name: string }[];
}) {
  const router = useRouter();
  const go = (d: string, r: string) =>
    router.push(`/field/report?date=${encodeURIComponent(d)}${r ? `&rep=${encodeURIComponent(r)}` : ""}`);

  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="date"
        value={date}
        onChange={e => e.target.value && go(e.target.value, rep)}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-slate-700"
      />
      <select
        value={rep}
        onChange={e => go(date, e.target.value)}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-slate-700"
      >
        <option value="">All reps</option>
        {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </div>
  );
}
