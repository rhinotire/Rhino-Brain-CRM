import type { MetadataRoute } from "next";
import { PublicCatalogService, PublicArticleService } from "@rhino/services";
import { BRAND_KEY } from "@/lib/brand";
import { CATEGORY_SLUGS, SITE, sizeToSlug } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, articles] = await Promise.all([
    PublicCatalogService.listPublished({ take: 200 }),
    PublicArticleService.listPublished(BRAND_KEY),
  ]);

  const staticPages = [
    "", "/tires", "/wheels", "/parts", "/quote", "/become-a-dealer", "/knowledge", "/tools",
    "/tools/tire-size-calculator", "/tools/trailer-load-calculator", "/tools/bolt-pattern-guide", "/tools/tire-size-converter", "/tools/cost-per-mile-calculator", "/tools/dot-date-decoder", "/tools/gear-ratio-calculator", "/tools/offset-backspacing-calculator", "/tools/tread-depth-guide", "/tools/temperature-pressure-calculator", "/tools/staggered-tire-calculator", "/find-installation",
    "/tires/by-size", "/tires/by-vehicle", "/tires/specialty", "/brands", "/deals", "/packages", "/supplies", "/dealer/quick-order",
  ].map((p) => ({
    url: `${SITE.url}${p}`,
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.7,
  }));

  const categoryPages = Object.keys(CATEGORY_SLUGS).map((slug) => ({
    url: `${SITE.url}/tires/${slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const sizeSet = new Map<string, string>(); // sizeSlug → sub
  for (const p of products) {
    if (!p.sizeSpec) continue;
    const sub = Object.entries(CATEGORY_SLUGS).find(([, c]) => c.db === p.category)?.[0];
    if (sub) sizeSet.set(sizeToSlug(p.sizeSpec), sub);
  }
  const sizePages = [...sizeSet].map(([size, sub]) => ({
    url: `${SITE.url}/tires/${sub}/${size}`,
    changeFrequency: "daily" as const,
    priority: 0.9, // key SEO surface
  }));

  const productPages = products.map((p) => ({
    url: `${SITE.url}/products/${p.slug}`,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  const articlePages = articles.map((a) => ({
    url: `${SITE.url}/knowledge/${a.slug}`,
    lastModified: a.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...categoryPages, ...sizePages, ...productPages, ...articlePages];
}
