"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { fetchChatMessages, sendChatMessage, type ChatMsg } from "@/actions/chat";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export function ChatRoom({ meId, initial }: { meId: string; initial: ChatMsg[] }) {
  const [messages, setMessages] = useState<ChatMsg[]>(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const atBottom = useRef(true);

  // near-real-time: refresh every 3s
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const fresh = await fetchChatMessages();
        setMessages(prev => (fresh.length !== prev.length || fresh[fresh.length - 1]?.id !== prev[prev.length - 1]?.id ? fresh : prev));
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (atBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    atBottom.current = true;
    start(async () => {
      const res = await sendChatMessage(body);
      if (res.error) { toast(res.error, "error"); setText(body); return; }
      setMessages(await fetchChatMessages());
    });
  };

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col rounded-lg border border-slate-200 bg-white">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No messages yet — say hi 👋</p>}
        {messages.map((m, i) => {
          const mine = m.authorId === meId;
          const showAuthor = i === 0 || messages[i - 1].authorId !== m.authorId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {showAuthor && <div className="mb-0.5 px-1 text-xs font-medium text-slate-500">{mine ? "You" : m.authorName}</div>}
              <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                {m.body}
              </div>
              <div className="mt-0.5 px-1 text-[10px] text-slate-400">{fmtTime(m.createdAt)}</div>
            </div>
          );
        })}
      </div>
      <div className="flex items-end gap-2 border-t border-slate-100 p-3">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message the team… (@name to notify someone, @all for everyone)"
          rows={1}
          className="max-h-32 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <Button onClick={send} disabled={pending || !text.trim()}>Send</Button>
      </div>
    </div>
  );
}
