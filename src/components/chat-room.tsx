"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { fetchChatMessages, sendChatMessage, sendChatImage, type ChatMsg, type ChatPeer } from "@/actions/chat";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

const SOUND_KEY = "rhino_chat_sound";

export function ChatRoom({ meId, peers, storageReady }: { meId: string; peers: ChatPeer[]; storageReady: boolean }) {
  const [peerId, setPeerId] = useState<string>(""); // "" = Team channel
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [sound, setSound] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const peerRef = useRef(peerId);
  const lastIdRef = useRef<string | null>(null);
  const primed = useRef(false);
  const soundRef = useRef(true);
  const toast = useToast();
  peerRef.current = peerId;
  soundRef.current = sound;

  useEffect(() => { try { setSound(localStorage.getItem(SOUND_KEY) !== "off"); } catch {} }, []);
  const toggleSound = () => setSound(s => { const v = !s; try { localStorage.setItem(SOUND_KEY, v ? "on" : "off"); } catch {} return v; });

  const beep = () => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new Ctx();
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
      o.start(); o.stop(ac.currentTime + 0.36);
    } catch {}
  };

  const load = async (pid: string) => {
    try {
      const fresh = await fetchChatMessages(pid || undefined);
      if (peerRef.current !== pid) return;
      const newest = fresh[fresh.length - 1];
      // sound when a new message from someone else arrives (skip the very first load)
      if (primed.current && newest && newest.id !== lastIdRef.current && newest.authorId !== meId && soundRef.current) beep();
      if (newest) lastIdRef.current = newest.id;
      primed.current = true;
      setMessages(fresh);
    } catch {}
  };

  useEffect(() => { atBottom.current = true; primed.current = false; lastIdRef.current = null; load(peerId); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [peerId]);
  useEffect(() => {
    const id = setInterval(() => load(peerRef.current), 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (atBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText(""); atBottom.current = true;
    start(async () => {
      const res = await sendChatMessage(body, peerId || undefined);
      if (res.error) { toast(res.error, "error"); setText(body); return; }
      load(peerId);
    });
  };

  const sendImage = async (file: File) => {
    setUploading(true); atBottom.current = true;
    const fd = new FormData();
    fd.set("file", file);
    if (peerId) fd.set("peerId", peerId);
    if (text.trim()) { fd.set("caption", text.trim()); setText(""); }
    const res = await sendChatImage(null, fd);
    setUploading(false);
    if (res.error) toast(res.error, "error");
    else load(peerId);
  };

  const peerName = peers.find(p => p.id === peerId)?.name ?? "Team Chat";

  return (
    <div className="flex h-[calc(100vh-9rem)] overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* Channels */}
      <div className="w-40 shrink-0 space-y-0.5 overflow-y-auto border-r border-slate-100 bg-slate-50 p-2 sm:w-52">
        <button onClick={() => setPeerId("")}
          className={`w-full truncate rounded-md px-2.5 py-2 text-left text-sm ${peerId === "" ? "bg-brand-600 font-semibold text-white" : "text-slate-700 hover:bg-slate-200"}`}>
          👥 Team Chat
        </button>
        <div className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Direct messages</div>
        {peers.map(p => (
          <button key={p.id} onClick={() => setPeerId(p.id)}
            className={`w-full truncate rounded-md px-2.5 py-2 text-left text-sm ${peerId === p.id ? "bg-brand-600 font-semibold text-white" : "text-slate-700 hover:bg-slate-200"}`}>
            {p.name}
          </button>
        ))}
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <span className="text-sm font-semibold text-slate-700">{peerId ? `Direct message · ${peerName}` : "👥 Team Chat — everyone"}</span>
          <button type="button" onClick={toggleSound} title={sound ? "Sound on — click to mute" : "Muted — click to enable sound"}
            className="rounded px-2 py-1 text-sm hover:bg-slate-100">{sound ? "🔔" : "🔕"}</button>
        </div>
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No messages yet — say hi 👋</p>}
          {messages.map((m, i) => {
            const mine = m.authorId === meId;
            const showAuthor = i === 0 || messages[i - 1].authorId !== m.authorId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {showAuthor && !mine && <div className="mb-0.5 px-1 text-xs font-medium text-slate-500">{m.authorName}</div>}
                <div className={`max-w-[80%] overflow-hidden rounded-2xl text-sm ${mine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                  {m.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <a href={m.imageUrl} target="_blank" rel="noreferrer"><img src={m.imageUrl} alt="" className="max-h-64 w-auto" /></a>
                  )}
                  {m.body && <div className="whitespace-pre-wrap break-words px-3 py-2">{m.body}</div>}
                </div>
                <div className="mt-0.5 px-1 text-[10px] text-slate-400">{fmtTime(m.createdAt)}</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-end gap-2 border-t border-slate-100 p-3">
          {storageReady && (
            <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-300 text-lg hover:bg-slate-50" title="Send a photo">
              {uploading ? "…" : "📷"}
              <input type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }} />
            </label>
          )}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={peerId ? `Message ${peerName}…` : "Message the team… (@name to notify, @all for everyone)"}
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <Button onClick={send} disabled={pending || !text.trim()}>Send</Button>
        </div>
      </div>
    </div>
  );
}
