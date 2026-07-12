/** Inline SVG graphics — tire/wheel imagery so the site reads "tires" at a glance. */

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
