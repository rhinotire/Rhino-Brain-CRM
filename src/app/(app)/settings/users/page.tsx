import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Table, THead, Badge } from "@/components/ui/primitives";
import { UserFormButton, ToggleActiveButton } from "@/components/user-form";
import { LocationFormButton } from "@/components/location-form";
import { roleLabels, fmtDate } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/dashboard");

  const [users, locations] = await Promise.all([
    db.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { customers: true, activities: true } }, location: { select: { name: true, shortTag: true, color: true } } },
    }),
    db.location.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Users & Locations</h1>
        <UserFormButton locations={locations} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="text-sm font-semibold">Locations</span>
          <LocationFormButton />
        </div>
        <ul className="divide-y divide-slate-50 px-4">
          {locations.map(l => (
            <li key={l.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="font-medium text-slate-800">{l.name}</span>
                <span className="text-xs text-slate-400">{l.city} · tag {l.shortTag}</span>
              </div>
              <LocationFormButton location={l} />
            </li>
          ))}
        </ul>
      </div>
      <Table>
        <THead cols={["Name", "Email", "Role", "Location", "Customers", "Activities", "Created", "Status", "Actions"]} />
        <tbody>
          {users.map(u => (
            <tr key={u.id} className={`border-b border-slate-50 ${u.active ? "hover:bg-slate-50" : "opacity-50"}`}>
              <td className="px-3 py-2 font-medium text-slate-800">{u.name}</td>
              <td className="px-3 py-2 text-slate-600">{u.email}</td>
              <td className="px-3 py-2">
                <Badge className={u.role === "ADMIN" ? "bg-brand-100 text-brand-800" : u.role === "MANAGER" ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}>
                  {roleLabels[u.role]}
                </Badge>
              </td>
              <td className="px-3 py-2">
                {u.role === "ADMIN" ? <Badge className="bg-slate-100 text-slate-500">All locations</Badge>
                  : u.location ? <Badge className="bg-slate-100 text-slate-600">{u.location.shortTag} · {u.location.name}</Badge>
                  : <span className="text-amber-600 text-xs">Unassigned</span>}
              </td>
              <td className="px-3 py-2 tabular-nums">{u._count.customers}</td>
              <td className="px-3 py-2 tabular-nums">{u._count.activities}</td>
              <td className="px-3 py-2">{fmtDate(u.createdAt)}</td>
              <td className="px-3 py-2">{u.active ? <Badge className="bg-emerald-100 text-emerald-800">Active</Badge> : <Badge className="bg-slate-100 text-slate-500">Inactive</Badge>}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1.5">
                  <UserFormButton user={{ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, locationId: u.locationId }} locations={locations} />
                  {u.id !== session.userId && <ToggleActiveButton userId={u.id} active={u.active} />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="text-xs text-slate-400">Deactivated users keep their history but can no longer log in. Reassign their customers from the Customers page.</p>
    </div>
  );
}
