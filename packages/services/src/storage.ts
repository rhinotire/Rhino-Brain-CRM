// Supabase Storage via plain REST (same pattern as the CRM's storage lib).
// Env (server-only): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

const DEALER_BUCKET = "dealer-docs"; // private — resale certificates etc.

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function isDealerStorageConfigured(): boolean {
  return config() !== null;
}

async function ensureBucket(c: NonNullable<ReturnType<typeof config>>) {
  const res = await fetch(`${c.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: DEALER_BUCKET, name: DEALER_BUCKET, public: false }),
  });
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    throw new Error(`Bucket setup failed: ${res.status}`);
  }
}

export async function uploadDealerDoc(path: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const c = config();
  if (!c) throw new Error("Document storage is not configured");
  await ensureBucket(c);
  const res = await fetch(`${c.url}/storage/v1/object/${DEALER_BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": contentType, "x-upsert": "true" },
    body: data,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
}

export async function signDealerDocUrl(path: string, expiresInSeconds = 7 * 24 * 3600): Promise<string | null> {
  const c = config();
  if (!c) return null;
  const res = await fetch(`${c.url}/storage/v1/object/sign/${DEALER_BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { signedURL: string };
  return `${c.url}/storage/v1${body.signedURL}`;
}
