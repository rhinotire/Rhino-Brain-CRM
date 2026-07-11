declare module "zipcodes" {
  export interface ZipEntry {
    zip: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
  }
  export function lookup(zip: string | number): ZipEntry | undefined;
  export function distance(zipA: string | number, zipB: string | number): number | null;
  export function radius(zip: string | number, miles: number, full?: boolean): string[];
}
