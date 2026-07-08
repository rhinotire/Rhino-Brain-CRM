"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { CustomerForm, type RepOption } from "./customer-form";

export function NewCustomerButton({ reps, canAssign, locations, currentLocationId }: {
  reps: RepOption[]; canAssign: boolean;
  locations?: { id: string; name: string; shortTag: string }[];
  currentLocationId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New Customer</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New Customer" wide>
        <CustomerForm reps={reps} canAssign={canAssign} locations={locations} currentLocationId={currentLocationId} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
