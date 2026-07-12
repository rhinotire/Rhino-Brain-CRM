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

// ---- Public bucket for product images (non-sensitive marketing photos) ----
const PUBLIC_BUCKET = "product-images";

async function ensurePublicBucket(c: NonNullable<ReturnType<typeof config>>) {
  const res = await fetch(`${c.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: PUBLIC_BUCKET, name: PUBLIC_BUCKET, public: true }),
  });
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    throw new Error(`Public bucket setup failed: ${res.status} ${await res.text()}`);
  }
}

/** Upload a product image and return its stored path. */
export async function uploadProductImage(path: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const c = config();
  if (!c) throw new Error("Image storage is not configured");
  await ensurePublicBucket(c);
  const res = await fetch(`${c.url}/storage/v1/object/${PUBLIC_BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": contentType, "x-upsert": "true" },
    body: data,
  });
  if (!res.ok) throw new Error(`Image upload failed: ${res.status} ${await res.text()}`);
}

export async function deleteProductImage(path: string): Promise<void> {
  const c = config();
  if (!c) return;
  await fetch(`${c.url}/storage/v1/object/${PUBLIC_BUCKET}/${path}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${c.key}` },
  }).catch(() => {});
}

/** Public URL for a product image path (no signing needed). */
export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!url) return null;
  return `${url}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
}

// ---- Brand assets (public bucket): website logos uploaded by the owner ----
const BRAND_BUCKET = "brand-assets";

export async function uploadBrandAsset(path: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const c = config();
  if (!c) throw new Error("Storage is not configured");
  await ensureNamedPublicBucket(c, BRAND_BUCKET);
  const res = await fetch(`${c.url}/storage/v1/object/${BRAND_BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": contentType, "x-upsert": "true" },
    body: data,
  });
  if (!res.ok) throw new Error(`Logo upload failed: ${res.status}`);
}

export async function deleteBrandAsset(path: string): Promise<void> {
  const c = config();
  if (!c) return;
  await fetch(`${c.url}/storage/v1/object/${BRAND_BUCKET}/${path}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${c.key}` },
  }).catch(() => {});
}

export function brandAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!url) return null;
  return `${url}/storage/v1/object/public/${BRAND_BUCKET}/${path}`;
}

// ---- Chat image attachments (public bucket) ----
const CHAT_BUCKET = "chat-images";

async function ensureNamedPublicBucket(c: NonNullable<ReturnType<typeof config>>, id: string) {
  const res = await fetch(`${c.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id, name: id, public: true }),
  });
  if (!res.ok && res.status !== 400 && res.status !== 409) throw new Error(`Bucket setup failed: ${res.status} ${await res.text()}`);
}

export async function uploadChatImage(path: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const c = config();
  if (!c) throw new Error("Image storage is not configured");
  await ensureNamedPublicBucket(c, CHAT_BUCKET);
  const res = await fetch(`${c.url}/storage/v1/object/${CHAT_BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": contentType, "x-upsert": "true" },
    body: data,
  });
  if (!res.ok) throw new Error(`Image upload failed: ${res.status} ${await res.text()}`);
}

export function chatImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!url) return null;
  return `${url}/storage/v1/object/public/${CHAT_BUCKET}/${path}`;
}
