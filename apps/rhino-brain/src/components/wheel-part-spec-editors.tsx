"use client";

import { useEffect } from "react";
import { useFormState } from "react-dom";
import { saveWheelSpec, savePartSpec } from "@/actions/product-specs";
import { Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

export type WheelSpecValues = Partial<{
  diameterIn: number | null; widthIn: number | null; boltPattern: string | null; centerBoreMm: number | null;
  offsetMm: number | null; backspacingIn: number | null; loadRatingLbs: number | null;
  finish: string | null; material: string | null;
}>;

export function WheelSpecEditor({ productId, spec }: { productId: string; spec: WheelSpecValues }) {
  const [state, action] = useFormState(saveWheelSpec, null);
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) toast("Wheel specs saved");
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="productId" value={productId} />
      <h2 className="text-sm font-semibold text-slate-800">Wheel specs</h2>
      <p className="mb-3 mt-0.5 text-xs text-slate-500">Stamped on the wheel or in the supplier sheet. Bolt pattern powers the trailer-wheel matcher on the website.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={`Diameter (in)`}><Input name="diameterIn" type="number" step="0.5" defaultValue={spec.diameterIn ?? ""} placeholder="15" className="h-11 text-base" /></Field>
        <Field label={`Width (in)`}><Input name="widthIn" type="number" step="0.25" defaultValue={spec.widthIn ?? ""} placeholder="6" className="h-11 text-base" /></Field>
        <Field label="Bolt pattern"><Input name="boltPattern" defaultValue={spec.boltPattern ?? ""} placeholder={`5x4.5`} className="h-11 text-base" /></Field>
        <Field label="Center bore (mm)"><Input name="centerBoreMm" type="number" step="0.1" defaultValue={spec.centerBoreMm ?? ""} placeholder="84" className="h-11 text-base" /></Field>
        <Field label="Offset ET (mm)"><Input name="offsetMm" type="number" defaultValue={spec.offsetMm ?? ""} placeholder="0" className="h-11 text-base" /></Field>
        <Field label={`Backspacing (in)`}><Input name="backspacingIn" type="number" step="0.05" defaultValue={spec.backspacingIn ?? ""} placeholder="4.25" className="h-11 text-base" /></Field>
        <Field label="Load rating (lbs)"><Input name="loadRatingLbs" type="number" defaultValue={spec.loadRatingLbs ?? ""} placeholder="2830" className="h-11 text-base" /></Field>
        <Field label="Material">
          <Select name="material" defaultValue={spec.material ?? ""} className="h-11 text-base">
            <option value="">—</option>
            <option value="Steel">Steel</option>
            <option value="Aluminum">Aluminum</option>
          </Select>
        </Field>
        <Field label="Finish" className="sm:col-span-2">
          <Input name="finish" defaultValue={spec.finish ?? ""} placeholder="Gloss black with milled accents, galvanized, white spoke…" className="h-11 text-base" />
        </Field>
      </div>
      <div className="mt-4"><SubmitButton>Save Specs</SubmitButton></div>
    </form>
  );
}

export type PartSpecValues = Partial<{
  partType: string | null; capacity: string | null; dimensions: string | null; material: string | null;
  mountingType: string | null; compatibilityNotes: string | null; certGrade: string | null;
}>;

const PART_TYPES = ["Jack", "Coupler", "Hub", "Bearing kit", "Axle", "Fender", "Winch", "Light", "Hardware", "Other"];
const MOUNTING = ["Bolt-on", "Weld-on", "Clamp-on", "Drop-in", "Other"];

export function PartSpecEditor({ productId, spec }: { productId: string; spec: PartSpecValues }) {
  const [state, action] = useFormState(savePartSpec, null);
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) toast("Part specs saved");
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const curType = spec.partType ?? "";
  const curMount = spec.mountingType ?? "";
  return (
    <form action={action} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="productId" value={productId} />
      <h2 className="text-sm font-semibold text-slate-800">Trailer-part specs</h2>
      <p className="mb-3 mt-0.5 text-xs text-slate-500">Capacity and fitment are what dealers ask first — fill those two at minimum.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Part type">
          <Select name="partType" defaultValue={curType} className="h-11 text-base">
            <option value="">—</option>
            {curType && !PART_TYPES.includes(curType) && <option value={curType}>{curType}</option>}
            {PART_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Capacity"><Input name="capacity" defaultValue={spec.capacity ?? ""} placeholder={`2000 lb, 3500 lb axle…`} className="h-11 text-base" /></Field>
        <Field label="Mounting">
          <Select name="mountingType" defaultValue={curMount} className="h-11 text-base">
            <option value="">—</option>
            {curMount && !MOUNTING.includes(curMount) && <option value={curMount}>{curMount}</option>}
            {MOUNTING.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Dimensions"><Input name="dimensions" defaultValue={spec.dimensions ?? ""} placeholder={`2" ball, 15" lift…`} className="h-11 text-base" /></Field>
        <Field label="Material"><Input name="material" defaultValue={spec.material ?? ""} placeholder="Steel, zinc-plated…" className="h-11 text-base" /></Field>
        <Field label="Cert / grade"><Input name="certGrade" defaultValue={spec.certGrade ?? ""} placeholder="DOT, Class III…" className="h-11 text-base" /></Field>
      </div>
      <Field label="Fits / compatibility" className="mt-3">
        <Textarea name="compatibilityNotes" rows={2} defaultValue={spec.compatibilityNotes ?? ""} placeholder={`Fits 2" x 3" trailer tongue; works with 3500 lb axles…`} />
      </Field>
      <div className="mt-4"><SubmitButton>Save Specs</SubmitButton></div>
    </form>
  );
}
