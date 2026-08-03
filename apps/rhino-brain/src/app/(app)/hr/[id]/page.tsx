import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireManager, locationScope } from "@/lib/auth";
import { isStorageConfigured } from "@/lib/storage";
import { employeeStatusLabels, fmtDate } from "@/lib/domain";
import { Badge } from "@/components/ui/primitives";
import { EditEmployeeButton, type EmployeeDTO } from "@/components/employee-form";
import { EmployeeDocuments, type EmployeeDocRow } from "@/components/employee-documents";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const session = await requireManager();
  const isAdmin = session.role === "ADMIN";

  const employee = await db.employee.findUnique({
    where: { id: params.id },
    include: {
      location: { select: { id: true, name: true, shortTag: true, color: true } },
      user: { select: { id: true, name: true } },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
    },
  });
  if (!employee) notFound();
  const guard = locationScope(session);
  if (guard.locationId && employee.locationId !== guard.locationId) notFound();

  const [locations, users] = await Promise.all([
    isAdmin
      ? db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, shortTag: true } })
      : Promise.resolve([]),
    db.user.findMany({ where: { active: true, ...locationScope(session) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const dto: EmployeeDTO = {
    id: employee.id, name: employee.name, position: employee.position,
    phone: employee.phone, email: employee.email,
    hireDate: employee.hireDate?.toISOString() ?? null,
    status: employee.status, endDate: employee.endDate?.toISOString() ?? null,
    notes: employee.notes, locationId: employee.locationId, userId: employee.userId,
  };
  const docRows: EmployeeDocRow[] = employee.documents.map(d => ({
    id: d.id, type: d.type, fileName: d.fileName,
    expiresAt: d.expiresAt?.toISOString() ?? null, sensitive: d.sensitive,
    createdAt: d.createdAt.toISOString(), uploadedBy: d.uploadedBy.name,
  }));

  const info: [string, string | null][] = [
    ["Phone", employee.phone],
    ["Email", employee.email],
    ["Hire date", employee.hireDate ? fmtDate(employee.hireDate) : null],
    ["End date", employee.endDate ? fmtDate(employee.endDate) : null],
    ["Company", employee.location.name],
    ["CRM login", employee.user?.name ?? null],
    ["Notes", employee.notes],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/hr" className="text-xs text-slate-400 hover:underline">← Employees</Link>
          <h1 className="text-xl font-bold">{employee.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            {employee.position && <span>{employee.position}</span>}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: employee.location.color }} />
              {employee.location.shortTag}
            </span>
            <Badge className={employee.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}>
              {employeeStatusLabels[employee.status]}
            </Badge>
          </div>
        </div>
        <EditEmployeeButton employee={dto} locations={locations} users={users} isAdmin={isAdmin} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Basic Info</h2>
          <dl className="space-y-2 text-sm">
            {info.map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <dt className="w-28 shrink-0 text-slate-400">{label}</dt>
                <dd className="text-slate-700">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Documents</h2>
          <EmployeeDocuments
            employeeId={employee.id}
            docs={docRows}
            isAdmin={isAdmin}
            storageReady={isStorageConfigured()}
          />
        </div>
      </div>
    </div>
  );
}
