import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicConsumerLeadService } from "@rhino/services";
import { getBrand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Your Request Status",
  robots: { index: false, follow: false }, // private capability page
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Request submitted",
  INSTALLER_NEEDED: "We're locating an installer near you",
  INSTALLER_CONTACTED: "Store contacted",
  INSTALLER_ACCEPTED: "Store accepted your request",
  INSTALLATION_SCHEDULED: "Installation scheduled",
  INSTALLATION_COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  MANUAL_ASSISTANCE_REQUIRED: "Our team is on it",
};

export default async function RequestStatusPage({ params }: { params: { token: string } }) {
  const [brand, status] = await Promise.all([getBrand(), PublicConsumerLeadService.getStatus(params.token)]);
  if (!status) notFound();

  const steps = [
    { label: "Product selected", done: true },
    { label: status.storeName ? `Store: ${status.storeName}` : "Finding the right store", done: !!status.storeName },
    { label: "Store confirms your request", done: ["INSTALLER_ACCEPTED", "INSTALLATION_SCHEDULED", "INSTALLATION_COMPLETED"].includes(status.status) },
    { label: "Installation", done: status.status === "INSTALLATION_COMPLETED" },
  ];

  return (
    <div className="mx-auto max-w-xl pt-8">
      <h1 className="text-2xl font-black">Your Request Has Been Sent</h1>
      <p className="mt-1 text-sm text-slate-600">
        {status.quantity}x {status.product} · Save this page — it&apos;s your tracking link.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 p-5">
        <div className="text-sm font-bold text-brand-dark">{STATUS_LABEL[status.status] ?? status.status}</div>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-brand text-ink" : "bg-slate-100 text-slate-400"}`}>
                {s.done ? "✓" : i + 1}
              </span>
              <span className={s.done ? "font-semibold" : "text-slate-500"}>{s.label}</span>
            </li>
          ))}
        </ol>
      </div>

      {status.storeName && status.storePhone && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
          Need it faster? Call <span className="font-bold">{status.storeName}</span> directly:{" "}
          <a href={`tel:${status.storePhone}`} className="font-bold text-brand-dark">{status.storePhone}</a>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Questions or changes? Call {brand.name} at{" "}
        <a href={`tel:${brand.phone}`} className="font-semibold">{brand.phoneDisplay}</a> and mention your name and ZIP code.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/" className="font-bold text-brand-dark">← Back to {brand.name}</Link>
      </p>
    </div>
  );
}
