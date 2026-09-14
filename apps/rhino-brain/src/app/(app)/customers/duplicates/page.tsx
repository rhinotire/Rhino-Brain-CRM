import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession, isManager, locationScope } from "@/lib/auth";
import { DuplicateGroups, CleanEmptyButton, type DupGroup } from "@/components/duplicate-merge";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();

const COUNT_LABELS: [string, string][] = [
  ["quotes", "quotes"], ["orders", "orders"], ["invoices", "A/R"], ["activities", "activities"],
  ["tasks", "tasks"], ["opportunities", "opps"], ["documents", "docs"], ["dealerUsers", "portal logins"],
  ["installers", "installer"], ["installerReferrals", "referrals"], ["leads", "leads"],
  ["dealerOrderRequests", "portal orders"], ["lostSales", "lost sales"], ["tags", "tags"],
];

export default async function DuplicateCustomersPage() {
  const session = await requireSession();
  if (!isManager(session)) redirect("/customers");

  const custs = await db.customer.findMany({
    where: { ...locationScope(session) },
    select: {
      id: true, companyName: true, contactPerson: true, phone: true, city: true, createdAt: true,
      locationId: true, location: { select: { name: true } },
      _count: {
        select: {
          activities: true, tasks: true, quotes: true, opportunities: true, tags: true, leads: true,
          documents: true, orders: true, invoices: true, lostSales: true, installers: true,
          installerReferrals: true, dealerUsers: true, dealerOrderRequests: true,
        },
      },
    },
    orderBy: { companyName: "asc" },
  });

  const byKey = new Map<string, typeof custs>();
  for (const c of custs) {
    const k = (c.locationId ?? "none") + "|" + norm(c.companyName);
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(c);
  }

  let emptyCount = 0;
  const groups: DupGroup[] = [];
  for (const [key, recs] of byKey) {
    if (recs.length < 2) continue;
    const mapped = recs.map(c => {
      const counts = COUNT_LABELS.map(([field, label]) => ({ label, n: c._count[field as keyof typeof c._count] }));
      const total = counts.reduce((s, x) => s + x.n, 0);
      return {
        id: c.id, companyName: c.companyName, contactPerson: c.contactPerson, phone: c.phone,
        city: c.city, createdAt: c.createdAt.toISOString(), counts, total,
      };
    });
    emptyCount += Math.min(mapped.filter(r => r.total === 0).length, mapped.length - 1);
    // groups with real split history first
    groups.push({ key, name: recs[0].companyName, locationName: recs[0].location?.name ?? "—", records: mapped });
  }
  groups.sort((a, b) => {
    const splitA = a.records.filter(r => r.total > 0).length;
    const splitB = b.records.filter(r => r.total > 0).length;
    return splitB - splitA || a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      <nav className="text-xs text-slate-400"><Link href="/customers" className="hover:underline">Customers</Link> / Duplicates</nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Duplicate Customers <span className="text-sm font-normal text-slate-400">({groups.length} groups)</span></h1>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Same company name, multiple records — history (quotes, orders, A/R, activity) gets split and stats lie.
            Pick the record to KEEP; everything from the others moves onto it, then they&apos;re deleted. Empty clones can be cleaned in one click.
          </p>
        </div>
        <CleanEmptyButton emptyCount={emptyCount} />
      </div>
      <DuplicateGroups groups={groups} />
    </div>
  );
}
