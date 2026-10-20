"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { queueCompetitorLookup } from "@/actions/competitor-lookup";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** Size search on /competitors: filters the table; "Fetch live" queues an
 * on-demand portal lookup when the size isn't watched yet. */
export function CompetitorSearch({ hasData }: { hasData: boolean }) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const search = () => router.push(q.trim() ? `/competitors?q=${encodeURIComponent(q.trim())}` : "/competitors");
  const fetchLive = () => {
    startTransition(async () => {
      const r = await queueCompetitorLookup(q);
      if (r.ok) toast(`Queued "${r.queued}" — the robot will fetch it within ~5 min, then refresh this page`);
      else toast(r.error ?? "Failed", "error");
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <Input
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") search(); }}
        placeholder="Search a size… e.g. 215/55R17 or ST235/80R16"
        className="w-72"
      />
      <Button variant="secondary" onClick={search}>Search</Button>
      {q.trim() && !hasData && (
        <Button onClick={fetchLive} disabled={pending}>
          {pending ? "Queueing…" : "🔄 Fetch from competitors (~5 min)"}
        </Button>
      )}
      {q.trim() && <Button variant="secondary" onClick={() => { setQ(""); router.push("/competitors"); }}>Clear</Button>}
    </div>
  );
}
