"use client";

import { useEffect, useRef, useState } from "react";

/** Finger/mouse signature pad → PNG data URL via onChange(dataUrl | null). */
export function SignaturePad({ onChange, labelEn, labelEs }: {
  onChange: (dataUrl: string | null) => void;
  labelEn: string;
  labelEs: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    // crisp lines on retina screens
    const scale = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = 160;
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    drawing.current = true;
    canvasRef.current!.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-700">{labelEn} <span className="block text-xs font-normal text-slate-400">{labelEs}</span></span>
        {hasInk && <button type="button" onClick={clear} className="text-xs text-slate-500 underline">clear / borrar</button>}
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="mt-1 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
        style={{ height: 160 }}
      />
      {!hasInk && <p className="mt-1 text-center text-xs text-slate-400">✍️ Sign here with your finger / Firme aquí con su dedo</p>}
    </div>
  );
}
