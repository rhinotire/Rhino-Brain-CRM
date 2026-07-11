"use client";

import { useTransition } from "react";
import { setLocationFilter } from "@/actions/auth";

export function LocationSwitcher({
  locations, current,
}: {
  locations: { id: string; name: string; shortTag: string; color: string }[];
  current: string | null;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="px-3 pb-2">
      <label className="mb-1 block px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Location
      </label>
      <select
        defaultValue={current ?? ""}
        disabled={pending}
        onChange={e => {
          const fd = new FormData();
          fd.set("locationId", e.target.value);
          start(() => setLocationFilter(fd));
        }}
        className="w-full rounded-md border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs text-white"
      >
        <option value="">🌎 All Locations</option>
        {locations.map(l => (
          <option key={l.id} value={l.id}>{l.name} ({l.shortTag})</option>
        ))}
      </select>
    </div>
  );
}
