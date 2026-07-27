/** Shipment reference codes: RT-YYMM-NNN, NNN a per-month counter (spec §3). */
export function refCodePrefix(d: Date): string {
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `RT-${yy}${mm}-`;
}

export function nextRefCode(prefix: string, latest: string | null): string {
  const n = latest ? parseInt(latest.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}
