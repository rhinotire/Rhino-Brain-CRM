"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type CallState = "idle" | "connecting" | "ringing" | "in-call" | "ended";

/**
 * Browser phone button (Twilio Voice SDK). Headset call straight from the CRM;
 * the server logs the CALL activity automatically when the call completes.
 * Renders nothing when `enabled` is false — pages fall back to tel: links.
 */
export function PhoneDialer({ phone, label, enabled }: { phone: string; label?: string; enabled: boolean }) {
  const [state, setState] = useState<CallState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const callRef = useRef<{ disconnect: () => void; mute: (m: boolean) => void } | null>(null);
  const deviceRef = useRef<{ destroy: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toast = useToast();

  useEffect(() => () => { // unmount cleanup
    if (timerRef.current) clearInterval(timerRef.current);
    callRef.current?.disconnect();
    deviceRef.current?.destroy();
  }, []);

  if (!enabled) return null;

  const startTimer = () => {
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
  };
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const dial = async () => {
    setState("connecting");
    try {
      const r = await fetch("/api/twilio/token", { method: "POST" });
      if (!r.ok) { toast(r.status === 501 ? "Phone system not configured yet" : "Could not start the call", "error"); setState("idle"); return; }
      const { token } = await r.json();
      const { Device } = await import("@twilio/voice-sdk");
      const device = new Device(token, { logLevel: "silent" as never });
      deviceRef.current = device as never;
      const call = await device.connect({ params: { To: phone } });
      callRef.current = call as never;
      setState("ringing");
      call.on("accept", () => { setState("in-call"); startTimer(); });
      call.on("disconnect", () => { stopTimer(); setState("ended"); setTimeout(() => setState("idle"), 1500); device.destroy(); });
      call.on("error", () => { stopTimer(); toast("Call failed — check mic permission and Twilio balance", "error"); setState("idle"); device.destroy(); });
    } catch {
      toast("Microphone blocked or network error", "error");
      setState("idle");
    }
  };

  const hangup = () => { callRef.current?.disconnect(); };
  const toggleMute = () => { const m = !muted; setMuted(m); callRef.current?.mute(m); };
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  if (state === "idle") {
    return <Button size="sm" variant="success" onClick={dial}>🎧 {label ?? "Call"}</Button>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1">
      <span className="text-xs font-semibold text-emerald-800">
        {state === "connecting" ? "Connecting…" : state === "ringing" ? "Ringing…" : state === "ended" ? "Ended" : `In call ${mmss}`}
      </span>
      {state === "in-call" && (
        <button type="button" onClick={toggleMute} className="rounded border border-emerald-300 px-1.5 text-xs text-emerald-700">
          {muted ? "Unmute" : "Mute"}
        </button>
      )}
      {(state === "ringing" || state === "in-call") && (
        <button type="button" onClick={hangup} className="rounded bg-red-600 px-1.5 text-xs font-semibold text-white">End</button>
      )}
    </span>
  );
}
