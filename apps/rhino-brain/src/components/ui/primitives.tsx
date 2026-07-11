import { cn } from "@/lib/utils";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// ---------- Button ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md";
};
export function Button({ variant = "primary", size = "md", className, ...props }: BtnProps) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    secondary: "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
  const sizes = { sm: "h-8 px-2.5 text-xs", md: "h-9 px-3.5 text-sm" };
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

// ---------- Form controls ----------
const control = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-9", className)} {...props} />;
}
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-9", className)} {...props}>{children}</select>;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-[80px]", className)} {...props} />;
}
export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{children}</label>;
}
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div className={className}><Label>{label}</Label>{children}</div>;
}

// ---------- Badge ----------
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", className || "bg-slate-100 text-slate-700")}>{children}</span>;
}

// ---------- Card ----------
export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "default" }: {
  label: string; value: ReactNode; hint?: string; tone?: "default" | "warn" | "danger" | "good";
}) {
  const tones = {
    default: "text-slate-900",
    warn: "text-amber-600",
    danger: "text-red-600",
    good: "text-emerald-600",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", tones[tone])}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

// ---------- Table ----------
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function THead({ cols }: { cols: string[] }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50">
      <tr>{cols.map(c => <th key={c} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{c}</th>)}</tr>
    </thead>
  );
}
export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return <tr><td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-400">{message}</td></tr>;
}
export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-sm text-slate-500">
      {message}{children}
    </div>
  );
}
