/**
 * Shared between server pages and the client InstallerForm. Lives OUTSIDE the
 * "use client" module on purpose: values exported from a client module become
 * opaque client references on the server — spreading EMPTY_INSTALLER in
 * /installers/new crashed with "Could not find the module … in the React
 * Client Manifest" when it was defined inside installer-form.tsx.
 */
export type InstallerFormValues = {
  id?: string;
  storeName: string;
  legalName: string;
  phone: string;
  email: string;
  notifyEmail: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  serviceRadiusMi: number;
  preferredStatus: string;
  customerId: string;
  passenger: boolean;
  lightTruck: boolean;
  trailer: boolean;
  tbr: boolean;
  wheels: boolean;
  mobileService: boolean;
  appointmentEnabled: boolean;
  sameDayEnabled: boolean;
};

export const EMPTY_INSTALLER: InstallerFormValues = {
  storeName: "", legalName: "", phone: "", email: "", notifyEmail: "", website: "",
  address: "", city: "", state: "", zip: "", serviceRadiusMi: 35, preferredStatus: "PARTNER",
  customerId: "",
  passenger: true, lightTruck: true, trailer: false, tbr: false, wheels: false, mobileService: false,
  appointmentEnabled: true, sameDayEnabled: false,
};
