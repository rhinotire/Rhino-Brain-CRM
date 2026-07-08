"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { upsertLocation } from "@/actions/quotes";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

type Loc = { id: string; name: string; city: string | null; shortTag: string; color: string };

export function LocationFormButton({ location }: { location?: Loc }) {
  const [open, setOpen] = useState(false);
  const bound = upsertLocation.bind(null, location?.id ?? null);
  const [state, action] = useFormState(bound, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast(location ? "Location updated" : "Location added"); setOpen(false); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button variant={location ? "ghost" : "secondary"} size="sm" onClick={() => setOpen(true)}>
        {location ? "Edit" : "+ Add Location"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={location ? `Edit ${location.name}` : "Add Location"}>
        <form action={action} className="space-y-3">
          <Field label="Business Name *"><Input name="name" defaultValue={location?.name} required placeholder="e.g. Everflow Tire" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City, State"><Input name="city" defaultValue={location?.city ?? ""} placeholder="Dallas, TX" /></Field>
            <Field label="Short Tag"><Input name="shortTag" defaultValue={location?.shortTag} maxLength={8} placeholder="TX" /></Field>
            <Field label="Badge Color"><Input name="color" type="color" defaultValue={location?.color ?? "#e8590c"} className="h-10 p-1" /></Field>
          </div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>{location ? "Save" : "Add location"}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
