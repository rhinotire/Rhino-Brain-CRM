import "server-only";
import { db } from "@/lib/db";
import { productImageUrl } from "@/lib/storage";

/**
 * One-way product sync: Rhino CRM → Shopify.
 * CRM is the source of truth. Only products marked visibility=PUBLIC are pushed.
 * Products are upserted by handle (derived from SKU) via the Admin GraphQL `productSet`
 * mutation, so re-running the sync updates existing listings instead of duplicating them.
 *
 * Go-live needs three env vars (set them in Vercel, never commit them):
 *   SHOPIFY_STORE_DOMAIN     e.g. "rhino-tire.myshopify.com"
 *   SHOPIFY_ADMIN_API_TOKEN  Admin API access token from a custom app (starts with shpat_)
 *   SHOPIFY_API_VERSION      optional, defaults to the pinned version below
 */
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

export function shopifyConfig() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN?.trim();
  return { domain, token, version: API_VERSION, configured: Boolean(domain && token) };
}

const UPSERT_PRODUCT = /* GraphQL */ `
mutation UpsertProductByHandle($input: ProductSetInput!, $identifier: ProductSetIdentifiers!) {
  productSet(synchronous: true, input: $input, identifier: $identifier) {
    product { id handle status variants(first: 1) { nodes { sku price } } }
    userErrors { field message }
  }
}`;

type GqlResponse<T> = { data?: T; errors?: { message: string }[] };

async function adminGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const { domain, token } = shopifyConfig();
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token! },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as GqlResponse<T>;
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join("; "));
  return json.data as T;
}

/** Products this sync considers: PUBLIC + active. */
const PUBLISHABLE_WHERE = { visibility: "PUBLIC" as const, active: true };

type SyncProduct = {
  sku: string; brand: string | null; name: string | null; sizeSpec: string | null;
  description: string; rawCategory: string | null; category: string;
  imagePath: string | null;
  msrp: unknown; priceA: unknown; priceB: unknown; priceC: unknown; priceD: unknown;
  bestSeller: boolean; specialOffer: boolean; featured: boolean;
};

/** First non-null public price, in Shopify's string "money" format, or null if none set yet. */
function pickPrice(p: SyncProduct): string | null {
  for (const v of [p.msrp, p.priceA, p.priceB, p.priceC, p.priceD]) {
    if (v !== null && v !== undefined) {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) return n.toFixed(2);
    }
  }
  return null;
}

function handleFor(sku: string): string {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 255);
}

function titleFor(p: SyncProduct): string {
  if (p.name?.trim()) return p.name.trim();
  return [p.brand, p.sizeSpec, p.description].filter(Boolean).join(" ").trim() || p.sku;
}

/** Build the Admin API `productSet` variables for one CRM product. */
export function mapProductToShopify(p: SyncProduct, price: string) {
  const handle = handleFor(p.sku);
  const tags = [p.rawCategory ?? p.category, p.brand, p.sizeSpec,
    p.bestSeller ? "best-seller" : null, p.specialOffer ? "special-offer" : null, p.featured ? "featured" : null,
  ].filter((t): t is string => Boolean(t));
  const imageUrl = productImageUrl(p.imagePath);
  return {
    identifier: { handle },
    input: {
      title: titleFor(p),
      handle,
      descriptionHtml: p.description ?? "",
      vendor: p.brand ?? "Rhino Tire",
      productType: p.rawCategory ?? p.category,
      status: "ACTIVE",
      tags,
      productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
      variants: [{ sku: p.sku, price, optionValues: [{ optionName: "Title", name: "Default Title" }] }],
      ...(imageUrl ? { files: [{ originalSource: imageUrl, contentType: "IMAGE" }] } : {}),
    },
  };
}

export type ShopifySyncResult = {
  configured: boolean;
  dryRun: boolean;
  storeDomain: string | null;
  totalPublishable: number;
  wouldSync: number;
  skipped: { sku: string; reason: string }[];
  synced: { sku: string; handle: string; status: string }[];
  errors: { sku: string; message: string }[];
};

/**
 * Push every PUBLIC + active product to Shopify.
 * dryRun=true (or missing credentials) previews what would sync without calling Shopify.
 */
export async function syncPublicProductsToShopify(opts: { dryRun?: boolean } = {}): Promise<ShopifySyncResult> {
  const cfg = shopifyConfig();
  const dryRun = opts.dryRun ?? !cfg.configured;

  const products = (await db.product.findMany({
    where: PUBLISHABLE_WHERE,
    select: {
      sku: true, brand: true, name: true, sizeSpec: true, description: true, rawCategory: true, category: true,
      imagePath: true, msrp: true, priceA: true, priceB: true, priceC: true, priceD: true,
      bestSeller: true, specialOffer: true, featured: true,
    },
    orderBy: { sku: "asc" },
  })) as unknown as SyncProduct[];

  const result: ShopifySyncResult = {
    configured: cfg.configured, dryRun, storeDomain: cfg.domain ?? null,
    totalPublishable: products.length, wouldSync: 0, skipped: [], synced: [], errors: [],
  };

  for (const p of products) {
    const price = pickPrice(p);
    if (!price) { result.skipped.push({ sku: p.sku, reason: "no price set (msrp / priceA–D all empty)" }); continue; }
    result.wouldSync++;
    if (dryRun) continue;
    try {
      const vars = mapProductToShopify(p, price);
      const data = await adminGraphql<{ productSet: { product: { handle: string; status: string } | null; userErrors: { field: string[]; message: string }[] } }>(UPSERT_PRODUCT, vars);
      const errs = data.productSet.userErrors;
      if (errs?.length) result.errors.push({ sku: p.sku, message: errs.map(e => e.message).join("; ") });
      else if (data.productSet.product) result.synced.push({ sku: p.sku, handle: data.productSet.product.handle, status: data.productSet.product.status });
    } catch (e) {
      result.errors.push({ sku: p.sku, message: e instanceof Error ? e.message : "sync failed" });
    }
  }
  return result;
}
