import "server-only";

// Supabase Storage via plain REST — no extra dependency.
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only env vars).

const BUCKET = "customer-docs";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function isStorageConfigured(): boolean {
  return config() !== null;
}

async function ensureBucket(c: NonNullable<ReturnType<typeof config>>) {
  const res = await fetch(`${c.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  // 400/409 = already exists — fine
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    throw new Error(`Bucket setup failed: ${res.status} ${await res.text()}`);
  }
}

export async function uploadObject(path: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const c = config();
  if (!c) throw new Error("Document storage is not configured");
  await ensureBucket(c);
  const res = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": contentType, "x-upsert": "true" },
    body: data,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
}

export async function createSignedUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const c = config();
  if (!c) throw new Error("Document storage is not configured");
  const res = await fetch(`${c.url}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: expiresInSeconds }),
  });
  if (!res.ok) throw new Error(`Sign failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { signedURL: string };
  return `${c.url}/storage/v1${body.signedURL}`;
}

export async function deleteObject(path: string): Promise<void> {
  const c = config();
  if (!c) throw new Error("Document storage is not configured");
  const res = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${c.key}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed: ${res.status} ${await res.text()}`);
}
