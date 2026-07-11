"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { CustomerForm, type RepOption } from "./customer-form";

export function EditCustomerButton({ customerId, values, reps, canAssign }: {
  customerId: string;
  values: Record<string, string | undefined>;
  reps: RepOption[];
  canAssign: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Edit</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit Customer" wide>
        <CustomerForm customerId={customerId} values={values} reps={reps} canAssign={canAssign} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
