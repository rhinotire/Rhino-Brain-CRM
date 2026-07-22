/** Inline SVG graphics — tire/wheel imagery so the site reads "tires" at a glance. */

import { COPY } from "@/lib/brand-copy";

/**
 * Hero graphic: a single detailed tire on an alloy wheel. Pure SVG so it
 * ships free, stays sharp at any size and never causes layout shift.
 */
export function HeroTireWheel({ className }: { className?: string }) {
  const blocks = Array.from({ length: 26 }, (_, i) => i * (360 / 26));
  const grooves = [166, 156, 147];
  const spokes = Array.from({ length: 6 }, (_, i) => i * 60);
  const lugs = Array.from({ length: 6 }, (_, i) => i * 60 + 30);
  return (
    <svg viewBox="0 0 440 440" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="hRubber" cx="0.38" cy="0.34">
          <stop offset="0.55" stopColor="#2b313c" />
          <stop offset="0.82" stopColor="#171c26" />
          <stop offset="1" stopColor="#0a0d13" />
        </radialGradient>
        <linearGradient id="hAlloy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1f5f9" />
          <stop offset="0.45" stopColor="#aab4c0" />
          <stop offset="0.7" stopColor="#7d8a99" />
          <stop offset="1" stopColor="#5c6878" />
        </linearGradient>
        <linearGradient id="hAlloyDeep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cbd5e1" />
          <stop offset="1" stopColor="#64748b" />
        </linearGradient>
        <radialGradient id="hBarrel">
          <stop offset="0.7" stopColor="#1c2430" />
          <stop offset="1" stopColor="#2e3947" />
        </radialGradient>
        <radialGradient id="hLug">
          <stop offset="0.3" stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#475569" />
        </radialGradient>
      </defs>

      {/* ---- tire on alloy wheel ---- */}
      <g transform="translate(220 220)">
        {/* whole wheel spins slowly (CSS .tire-spin, still under reduced-motion);
            the specular highlight stays fixed outside this group like real light */}
        <g className="tire-spin">
        {/* tread blocks — chunky, slightly rounded, with a sipe cut */}
        {blocks.map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <rect x={-13} y={-208} width={26} height={38} rx={6} fill="#10141b" />
            <rect x={-2} y={-206} width={4} height={34} rx={2} fill="#1f2630" />
          </g>
        ))}
        {/* rubber body + shoulder */}
        <circle r={192} fill="url(#hRubber)" />
        <circle r={192} fill="none" stroke="#05070b" strokeWidth={3} />
        {/* sidewall grooves */}
        {grooves.map((r) => (
          <circle key={r} r={r} fill="none" stroke="#39404d" strokeWidth={1.5} opacity={0.7} />
        ))}
        {/* embossed brand lettering on the sidewall */}
        <path id="hArc" d="M -138 0 A 138 138 0 0 1 138 0" fill="none" />
        <text fontFamily="'Barlow Condensed','Arial Narrow',sans-serif" fontWeight={700} fontSize={30}
          letterSpacing={7} fill="#454d5b">
          <textPath href="#hArc" startOffset="50%" textAnchor="middle">{COPY.heroSidewallText}</textPath>
        </text>
        <path id="hArcB" d="M 138 0 A 138 138 0 0 1 -138 0" fill="none" />
        <text fontFamily="'Barlow Condensed','Arial Narrow',sans-serif" fontWeight={600} fontSize={20}
          letterSpacing={6} fill="#3b424f">
          <textPath href="#hArcB" startOffset="50%" textAnchor="middle">WHOLESALE · TIRES · WHEELS</textPath>
        </text>
        {/* gold pinstripe + machined lip */}
        <circle r={117} fill="none" stroke="rgb(var(--brand))" strokeWidth={3.5} />
        <circle r={110} fill="url(#hAlloy)" />
        <circle r={97} fill="url(#hBarrel)" />
        {/* six tapered twin spokes */}
        {spokes.map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <path d="M -20 -30 L -30 -94 Q -16 -102 -4 -100 L -4 -34 Q -12 -30 -20 -30 Z" fill="url(#hAlloyDeep)" />
            <path d="M 20 -30 L 30 -94 Q 16 -102 4 -100 L 4 -34 Q 12 -30 20 -30 Z" fill="url(#hAlloy)" />
          </g>
        ))}
        {/* hub: lugs + gold-ringed center cap */}
        <circle r={44} fill="url(#hAlloy)" />
        {lugs.map((a) => (
          <circle key={a} cx={0} cy={-33} r={6.5} fill="url(#hLug)" transform={`rotate(${a})`} />
        ))}
        <circle r={19} fill="#141a24" />
        <circle r={19} fill="none" stroke="rgb(var(--brand))" strokeWidth={2.5} />
        <circle r={7} fill="#39404d" />
        </g>
        {/* specular highlight — fixed light source over the spinning tire */}
        <path d="M -150 -95 A 178 178 0 0 1 -20 -177" fill="none" stroke="#ffffff" strokeWidth={20} strokeLinecap="round" opacity={0.06} />
      </g>
    </svg>
  );
}

export function TireGraphic({ className }: { className?: string }) {
  const treads = Array.from({ length: 30 }, (_, i) => i * 12);
  const spokes = Array.from({ length: 7 }, (_, i) => i * (360 / 7));
  const lugs = Array.from({ length: 6 }, (_, i) => i * 60);
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="rimG">
          <stop offset="0.55" stopColor="#e2e8f0" />
          <stop offset="0.8" stopColor="#94a3b8" />
          <stop offset="1" stopColor="#64748b" />
        </radialGradient>
        <radialGradient id="tireG">
          <stop offset="0.75" stopColor="#1f2937" />
          <stop offset="1" stopColor="#0b1220" />
        </radialGradient>
      </defs>
      {treads.map((a) => (
        <rect key={a} x={190} y={2} width={20} height={30} rx={5} fill="#0b1220" transform={`rotate(${a} 200 200)`} />
      ))}
      <circle cx={200} cy={200} r={184} fill="url(#tireG)" />
      <circle cx={200} cy={200} r={148} fill="#0b1220" />
      <circle cx={200} cy={200} r={126} fill="none" stroke="#e5a50a" strokeWidth={4} />
      <circle cx={200} cy={200} r={118} fill="url(#rimG)" />
      <circle cx={200} cy={200} r={102} fill="#475569" />
      {spokes.map((a) => (
        <rect key={a} x={186} y={104} width={28} height={100} rx={12} fill="url(#rimG)" transform={`rotate(${a} 200 200)`} />
      ))}
      <circle cx={200} cy={200} r={46} fill="url(#rimG)" />
      <circle cx={200} cy={200} r={38} fill="#94a3b8" />
      {lugs.map((a) => (
        <circle key={a} cx={200} cy={178} r={7} fill="#334155" transform={`rotate(${a} 200 200)`} />
      ))}
      <circle cx={200} cy={200} r={10} fill="#334155" />
    </svg>
  );
}

/** Subtle repeating tread chevrons — hero background texture. */
export function TreadTexture({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern id="treadp" width="44" height="30" patternUnits="userSpaceOnUse">
          <path d="M0 24 L15 8 L22 8 L7 24 Z M22 24 L37 8 L44 8 L29 24 Z" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#treadp)" />
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const };

export function TireIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" {...stroke} />
      <circle cx="12" cy="12" r="4.5" {...stroke} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="12" y1="1.6" x2="12" y2="4.4" {...stroke} transform={`rotate(${a} 12 12)`} />
      ))}
    </svg>
  );
}

export function WheelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" {...stroke} />
      <circle cx="12" cy="12" r="2.4" {...stroke} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <line key={a} x1="12" y1="5" x2="12" y2="9.6" {...stroke} transform={`rotate(${a} 12 12)`} />
      ))}
    </svg>
  );
}

export function TruckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M2 6h11v9H2z M13 9h5l3 3v3h-8" {...stroke} strokeLinejoin="round" />
      <circle cx="6.5" cy="17.5" r="2" {...stroke} />
      <circle cx="17" cy="17.5" r="2" {...stroke} />
    </svg>
  );
}

export function TrailerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M2 7h14v8H2z M16 12h6" {...stroke} strokeLinejoin="round" />
      <circle cx="7" cy="17.5" r="2" {...stroke} />
      <circle cx="12" cy="17.5" r="2" {...stroke} />
    </svg>
  );
}
