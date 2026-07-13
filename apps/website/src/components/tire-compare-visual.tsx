"use client";

/**
 * To-scale visual comparison for the tire size calculator: side profiles with
 * dimension callouts, front-view wheels with circumference/revs, and a
 * ground-line overlay showing the ride-height change. Everything is computed
 * from real inches with one px-per-inch scale per panel.
 */

type Calc = { diameterIn: number; widthIn: number; sidewallIn: number; circumferenceIn: number; revsPerMile: number };

const A_COLOR = "#1e293b"; // navy slate — current tire
const B_COLOR = "#c98a00"; // brand gold (dark enough to read) — new tire
const DIM = "#64748b";

const fmt = (n: number, d = 1) => n.toFixed(d);
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(d)}`;

function DimLabel({ x, y, children, fill = DIM, size = 11, anchor = "middle" }: {
  x: number; y: number; children: string; fill?: string; size?: number; anchor?: "start" | "middle" | "end";
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={700} fill={fill}
      stroke="#ffffff" strokeWidth={3.5} paintOrder="stroke" style={{ fontVariantNumeric: "tabular-nums" }}>
      {children}
    </text>
  );
}

/** horizontal dimension line |←   →| */
function HDim({ x1, x2, y, label, fill = DIM }: { x1: number; x2: number; y: number; label: string; fill?: string }) {
  return (
    <g stroke={fill} strokeWidth={1.2}>
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} />
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <DimLabel x={(x1 + x2) / 2} y={y - 5} fill={fill}>{label}</DimLabel>
    </g>
  );
}

/** vertical dimension line */
function VDim({ x, y1, y2, label, fill = DIM }: { x: number; y1: number; y2: number; label: string; fill?: string }) {
  return (
    <g stroke={fill} strokeWidth={1.2}>
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} />
      <line x1={x} y1={y1} x2={x} y2={y2} />
      <DimLabel x={x} y={(y1 + y2) / 2 + 4} fill={fill} anchor="middle">{label}</DimLabel>
    </g>
  );
}

function Ground({ y, x1, x2 }: { y: number; x1: number; x2: number }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#94a3b8" strokeWidth={1.5} />
      {Array.from({ length: Math.floor((x2 - x1) / 14) }, (_, i) => (
        <line key={i} x1={x1 + 6 + i * 14} y1={y} x2={x1 + i * 14} y2={y + 7} stroke="#cbd5e1" strokeWidth={1} />
      ))}
    </g>
  );
}

/** Panel 1 — side profiles to scale: width + diameter + sidewall. */
function ProfilePanel({ ca, cb, la, lb }: { ca: Calc; cb: Calc; la: string; lb: string }) {
  const W = 330, H = 268, groundY = 218;
  const s = 168 / Math.max(ca.diameterIn, cb.diameterIn);
  const wA = ca.widthIn * s, hA = ca.diameterIn * s;
  const wB = cb.widthIn * s, hB = cb.diameterIn * s;
  const cxA = 108, cxB = 108 + wA / 2 + 34 + wB / 2;

  const profile = (cx: number, w: number, h: number, side: Calc, color: string, n: string) => {
    const top = groundY - h;
    const sidewallPx = side.sidewallIn * s;
    return (
      <g>
        <rect x={cx - w / 2} y={top} width={w} height={h} rx={Math.min(w * 0.32, 14)} fill={color} />
        {/* tread grooves */}
        {[0.3, 0.5, 0.7].map((f) => (
          <line key={f} x1={cx - w / 2 + w * f} y1={top + 3} x2={cx - w / 2 + w * f} y2={groundY - 3} stroke="#ffffff" strokeOpacity={0.14} strokeWidth={2} />
        ))}
        {/* rim edges: sidewall region markers */}
        <line x1={cx - w / 2 + 2} y1={top + sidewallPx} x2={cx + w / 2 - 2} y2={top + sidewallPx} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1.5} />
        <line x1={cx - w / 2 + 2} y1={groundY - sidewallPx} x2={cx + w / 2 - 2} y2={groundY - sidewallPx} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1.5} />
        <text x={cx} y={top + h / 2 + 8} textAnchor="middle" fontSize={22} fontWeight={800} fill="#ffffff" opacity={0.9}>{n}</text>
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Side profile comparison">
      {profile(cxA, wA, hA, ca, A_COLOR, "1")}
      {profile(cxB, wB, hB, cb, B_COLOR, "2")}
      <Ground y={groundY} x1={14} x2={W - 14} />
      {/* diameters on the outer flanks */}
      <VDim x={cxA - wA / 2 - 22} y1={groundY - hA} y2={groundY} label={`${fmt(ca.diameterIn)}"`} fill={A_COLOR} />
      <VDim x={cxB + wB / 2 + 22} y1={groundY - hB} y2={groundY} label={`${fmt(cb.diameterIn)}"`} fill={B_COLOR} />
      {/* sidewall bracket between the two */}
      <VDim x={cxA + wA / 2 + 12} y1={groundY - hA} y2={groundY - hA + ca.sidewallIn * s} label={`${fmt(ca.sidewallIn)}"`} fill={DIM} />
      {/* widths under the ground */}
      <HDim x1={cxA - wA / 2} x2={cxA + wA / 2} y={groundY + 22} label={`${fmt(ca.widthIn)}"`} fill={A_COLOR} />
      <HDim x1={cxB - wB / 2} x2={cxB + wB / 2} y={groundY + 22} label={`${fmt(cb.widthIn)}"`} fill={B_COLOR} />
      <DimLabel x={cxA} y={H - 6} fill={A_COLOR}>{la}</DimLabel>
      <DimLabel x={cxB} y={H - 6} fill={B_COLOR}>{lb}</DimLabel>
    </svg>
  );
}

/** Panel 2 — front-view wheels: rim, circumference, revs per mile. */
function WheelPanel({ ca, cb, rimA, rimB, la, lb }: { ca: Calc; cb: Calc; rimA: number; rimB: number; la: string; lb: string }) {
  const W = 330, H = 268, groundY = 218;
  // fit by height AND by the two wheels' combined width
  const s = Math.min(168 / Math.max(ca.diameterIn, cb.diameterIn), (W - 60) / (ca.diameterIn + cb.diameterIn));
  const rA = (ca.diameterIn * s) / 2, rB = (cb.diameterIn * s) / 2;
  const startX = (W - (2 * rA + 28 + 2 * rB)) / 2;
  const cxA = startX + rA, cxB = startX + 2 * rA + 28 + rB;

  const wheel = (cx: number, r: number, rimIn: number, side: Calc, color: string) => {
    const cy = groundY - r;
    const rimR = (rimIn * s) / 2;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r - (r - rimR) / 2} fill="none" stroke={color} strokeWidth={r - rimR} />
        <circle cx={cx} cy={cy} r={rimR} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={1.5} />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={cx} y1={cy} x2={cx + rimR * 0.88 * Math.cos((i * Math.PI) / 4)} y2={cy + rimR * 0.88 * Math.sin((i * Math.PI) / 4)}
            stroke="#94a3b8" strokeWidth={2.5} strokeLinecap="round" />
        ))}
        <circle cx={cx} cy={cy} r={Math.max(rimR * 0.16, 3)} fill="#64748b" />
        <DimLabel x={cx} y={cy + 4} fill="#475569" size={10}>{`${rimIn}"`}</DimLabel>
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Front view wheel comparison">
      {wheel(cxA, rA, rimA, ca, A_COLOR)}
      {wheel(cxB, rB, rimB, cb, B_COLOR)}
      <Ground y={groundY} x1={14} x2={W - 14} />
      <DimLabel x={cxA} y={groundY - rA * 2 - 10} fill={A_COLOR}>{`⌀ ${fmt(ca.diameterIn)}"`}</DimLabel>
      <DimLabel x={cxB} y={groundY - rB * 2 - 10} fill={B_COLOR}>{`⌀ ${fmt(cb.diameterIn)}"`}</DimLabel>
      <DimLabel x={cxA} y={groundY + 24} fill={A_COLOR}>{`${fmt(ca.circumferenceIn)}" around`}</DimLabel>
      <DimLabel x={cxB} y={groundY + 24} fill={B_COLOR}>{`${fmt(cb.circumferenceIn)}" around`}</DimLabel>
      <DimLabel x={cxA} y={groundY + 42} fill={DIM}>{`${Math.round(ca.revsPerMile)} revs/mile`}</DimLabel>
      <DimLabel x={cxB} y={groundY + 42} fill={DIM}>{`${Math.round(cb.revsPerMile)} revs/mile`}</DimLabel>
    </svg>
  );
}

/** Panel 3 — both tires on the same ground line: the ride-height story. */
function OverlayPanel({ ca, cb }: { ca: Calc; cb: Calc }) {
  const W = 330, H = 268, groundY = 218;
  const s = 168 / Math.max(ca.diameterIn, cb.diameterIn);
  const rA = (ca.diameterIn * s) / 2, rB = (cb.diameterIn * s) / 2;
  const cx = 132;
  const topA = groundY - rA * 2, topB = groundY - rB * 2;
  const heightDiff = cb.diameterIn - ca.diameterIn;
  const rideDiff = heightDiff / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Ride height overlay">
      <circle cx={cx} cy={groundY - rA} r={rA} fill="none" stroke={A_COLOR} strokeWidth={6} />
      <circle cx={cx} cy={groundY - rB} r={rB} fill="none" stroke={B_COLOR} strokeWidth={6} strokeOpacity={0.9} />
      {/* axle centers */}
      <circle cx={cx} cy={groundY - rA} r={3.5} fill={A_COLOR} />
      <circle cx={cx} cy={groundY - rB} r={3.5} fill={B_COLOR} />
      <Ground y={groundY} x1={14} x2={W - 14} />
      {/* top-of-tire guide lines out to the measurement */}
      <line x1={cx} y1={topA} x2={W - 44} y2={topA} stroke={A_COLOR} strokeDasharray="4 3" strokeWidth={1.2} />
      <line x1={cx} y1={topB} x2={W - 44} y2={topB} stroke={B_COLOR} strokeDasharray="4 3" strokeWidth={1.2} />
      {Math.abs(heightDiff) > 0.05 && (
        <VDim x={W - 40} y1={Math.min(topA, topB)} y2={Math.max(topA, topB)} label={`${signed(heightDiff)}"`}
          fill={heightDiff >= 0 ? B_COLOR : A_COLOR} />
      )}
      <DimLabel x={cx} y={28} fill="#334155" size={12}>
        {Math.abs(rideDiff) < 0.03 ? "Same ride height" : `Vehicle sits ${signed(rideDiff)}" ${rideDiff >= 0 ? "higher" : "lower"}`}
      </DimLabel>
      <DimLabel x={cx} y={H - 6} fill={DIM}>Both tires on the same ground</DimLabel>
    </svg>
  );
}

export function TireCompareVisual({ ca, cb, rimA, rimB, la, lb }: {
  ca: Calc; cb: Calc; rimA: number; rimB: number; la: string; lb: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">Size comparison — drawn to scale</h2>
        <div className="flex gap-4 text-xs font-bold">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: A_COLOR }} /> 1 · {la}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: B_COLOR }} /> 2 · {lb}</span>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <ProfilePanel ca={ca} cb={cb} la={la} lb={lb} />
        <WheelPanel ca={ca} cb={cb} rimA={rimA} rimB={rimB} la={la} lb={lb} />
        <OverlayPanel ca={ca} cb={cb} />
      </div>
    </div>
  );
}
