"use client";

import { useState } from "react";
import Link from "next/link";
import { markNotificationsRead } from "@/actions/quotes";

type N = { id: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: string };

export function NotificationBell({ notifications, unread }: { notifications: N[]; unread: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={async () => {
          setOpen(o => !o);
          if (!open && unread > 0) await markNotificationsRead();
        }}
        className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">Notifications</div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">Nothing new. You&apos;re all caught up.</div>
            )}
            {notifications.map(n => (
              <Link key={n.id} href={n.link || "#"} onClick={() => setOpen(false)}
                className={`block border-b border-slate-50 px-4 py-2.5 text-sm hover:bg-slate-50 ${n.read ? "text-slate-500" : "font-medium text-slate-800"}`}>
                {n.title}
                {n.body && <div className="text-xs font-normal text-slate-400">{n.body}</div>}
                <div className="text-[11px] font-normal text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
