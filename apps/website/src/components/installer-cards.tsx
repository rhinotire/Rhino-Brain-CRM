import type { PublicInstallerDTO } from "@rhino/services";
import { ConsumerRequestForm } from "@/components/consumer-request-form";

const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function Hours({ hours }: { hours: Record<string, string> | null }) {
  if (!hours) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-slate-500 sm:grid-cols-4">
      {Object.entries(hours).map(([d, h]) => (
        <span key={d}>
          <span className="font-semibold">{DAY_LABEL[d] ?? d}</span> {h === "closed" ? "Closed" : h}
        </span>
      ))}
    </div>
  );
}

/** IDEAL / partner option card (spec §9). No pricing — installed price is requested, not promised. */
export function InstallerCard({
  installer,
  owned,
  productId,
  tireSize,
  zip,
}: {
  installer: PublicInstallerDTO;
  owned: boolean;
  productId?: string;
  tireSize?: string;
  zip: string;
}) {
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${installer.address}, ${installer.city}, ${installer.state} ${installer.zip}`,
  )}`;
  return (
    <div className="rounded-2xl border-2 border-brand bg-white p-5">
      {owned && (
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-dark">
          Available near {installer.city} — professional installation
        </div>
      )}
      <div className="text-lg font-black">{installer.storeName}</div>
      <div className="mt-1 text-sm text-slate-600">
        {installer.address}, {installer.city}, {installer.state} {installer.zip}
        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold">{installer.distanceMi} mi from {zip}</span>
      </div>
      <Hours hours={installer.hours} />
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={`tel:${installer.phone}`} className="rounded-lg bg-ink px-4 py-2.5 text-sm font-bold text-white">
          📞 Call {installer.phoneDisplay}
        </a>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold">
          Get Directions
        </a>
      </div>
      <ConsumerRequestForm installerId={installer.id} productId={productId} tireSize={tireSize} zip={zip} appointmentEnabled={installer.appointmentEnabled} />
    </div>
  );
}
