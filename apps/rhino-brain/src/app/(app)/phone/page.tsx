import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isTwilioConfigured } from "@/lib/twilio";
import { PhoneKeypad } from "@/components/phone-keypad";
import { Table, THead, EmptyRow } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/** Standalone browser phone: dial any number + the rep's recent call log. */
export default async function PhonePage() {
  const session = await requireSession();
  const twilioReady = isTwilioConfigured();

  const recent = await db.activity.findMany({
    where: { repId: session.userId, type: "CALL" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true, subject: true, createdAt: true,
      customer: { select: { id: true, companyName: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Phone</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Dial any number straight from the browser — you need a headset or microphone plugged in.
        </p>
      </div>

      {twilioReady ? (
        <PhoneKeypad />
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The phone system is not configured yet.
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">My recent calls</h2>
        <Table>
          <THead cols={["When", "Customer", "Call"]} />
          <tbody className="divide-y divide-slate-100">
            {recent.length === 0 && <EmptyRow colSpan={3} message="No calls yet — completed calls are logged here automatically." />}
            {recent.map(a => (
              <tr key={a.id}>
                <td className="px-3 py-2.5 text-xs text-slate-500">
                  {a.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </td>
                <td className="px-3 py-2.5">
                  {a.customer ? (
                    <Link href={`/customers/${a.customer.id}`} className="font-medium text-brand-700 hover:underline">
                      {a.customer.companyName}
                    </Link>
                  ) : (
                    <span className="text-slate-400">Not a saved customer</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-600">{a.subject}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
