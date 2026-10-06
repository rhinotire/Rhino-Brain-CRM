"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEmployee } from "@/actions/hr";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** ADMIN-only hard delete, for duplicates — real departures use status TERMINATED. */
export function DeleteEmployeeButton({ employeeId, name }: { employeeId: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const run = () => {
    if (!window.confirm(`Delete "${name}" permanently?\n\nThis removes the employee AND all their uploaded documents. For a real departure, set status to Terminated instead.`)) return;
    start(async () => {
      const r = await deleteEmployee(employeeId);
      if (r.ok) { toast("Employee deleted"); router.push("/hr"); router.refresh(); }
      else toast(r.error ?? "Delete failed", "error");
    });
  };

  return (
    <Button size="sm" variant="danger" onClick={run} disabled={pending}>
      {pending ? "Deleting…" : "🗑 Delete"}
    </Button>
  );
}
