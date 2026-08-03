import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager, locationScope, adminLocFilter } from "@/lib/auth";
import { worstExpiryStatus, coreDocsOnFile } from "@rhino/services";
import { employeeStatusLabels, CORE_EMPLOYEE_DOC_TYPES, fmtDate } from "@/lib/domain";
import { Table, THead, EmptyRow, Badge } from "@/components/ui/primitives";
import { NewEmployeeButton } from "@/components/employee-form";

export const dynamic = "force-dynamic";

const TEMPLATES: [string, string][] = [
  ["Rhino-Tire-USA-Offer-Letter-Template.docx", "Offer Letter Template"],
  ["Rhino-Tire-USA-Onboarding-Checklist.docx", "Onboarding Checklist"],
  ["Rhino-Tire-USA-Policy-Acknowledgments.docx", "Policy Acknowledgments"],
  ["Rhino-Tire-USA-Emergency-Contact-Form.docx", "Emergency Contact Form"],
];

export default async function HrPage() {
  const session = await requireManager();
  const isAdmin = session.role === "ADMIN";
  const showLocCol = isAdmin && !adminLocFilter();

  const [employees, locations, users] = await Promise.all([
    db.employee.findMany({
      where: { ...locationScope(session) },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        location: { select: { shortTag: true, name: true, color: true } },
        documents: { select: { type: true, expiresAt: true } },
      },
    }),
    isAdmin
      ? db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, shortTag: true } })
      : Promise.resolve([]),
    db.user.findMany({ where: { active: true, ...locationScope(session) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const expiryDot = (docs: { expiresAt: Date | null }[]) => {
    const worst = worstExpiryStatus(docs.map(d => d.expiresAt));
    if (worst === "expired") return <span title="A document is expired" className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />;
    if (worst === "expiring") return <span title="A document expires within 30 days" className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />;
    return null;
  };

  const cols = ["Name", "Position", ...(showLocCol ? ["Company"] : []), "Status", "Hire date", "Documents", " "];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Employees <span className="text-sm font-normal text-slate-400">({employees.length})</span></h1>
        <NewEmployeeButton locations={locations} users={users} isAdmin={isAdmin} currentLocationId={adminLocFilter()} />
      </div>

      <Table>
        <THead cols={cols} />
        <tbody>
          {employees.length === 0 && <EmptyRow colSpan={cols.length} message="No employees yet — add your first employee." />}
          {employees.map(e => (
            <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2">
                <Link href={`/hr/${e.id}`} className="font-medium text-brand-600 hover:underline">{e.name}</Link>
              </td>
              <td className="px-3 py-2 text-slate-600">{e.position ?? "—"}</td>
              {showLocCol && (
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: e.location.color }} />
                    {e.location.shortTag}
                  </span>
                </td>
              )}
              <td className="px-3 py-2">
                <Badge className={e.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}>
                  {employeeStatusLabels[e.status]}
                </Badge>
              </td>
              <td className="px-3 py-2 text-slate-600">{e.hireDate ? fmtDate(e.hireDate) : "—"}</td>
              <td className="px-3 py-2 text-slate-600">
                <span className="mr-2">{coreDocsOnFile(e.documents, CORE_EMPLOYEE_DOC_TYPES)}/{CORE_EMPLOYEE_DOC_TYPES.length}</span>
                {expiryDot(e.documents)}
              </td>
              <td className="px-3 py-2 text-right">
                <Link href={`/hr/${e.id}`} className="text-xs text-brand-600 hover:underline">Open →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">New-Hire Packet Templates</h2>
        <p className="mb-3 text-xs text-slate-500">Blank forms to print for a new hire. Signed copies go into the employee&apos;s document vault.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map(([file, label]) => (
            <a key={file} href={`/api/hr-templates/${file}`}
               className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <span>📄</span>{label}<span className="ml-auto text-xs text-slate-400">DOCX</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
