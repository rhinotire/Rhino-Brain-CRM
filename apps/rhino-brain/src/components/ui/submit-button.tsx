"use client";
import { useFormStatus } from "react-dom";
import { Button } from "./primitives";

export function SubmitButton({ children, variant }: { children: React.ReactNode; variant?: "primary" | "danger" | "success" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} disabled={pending}>{pending ? "Saving…" : children}</Button>;
}
