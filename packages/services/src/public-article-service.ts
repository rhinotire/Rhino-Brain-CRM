import { db } from "@rhino/database";

export type PublicArticleDTO = {
  slug: string;
  title: string;
  description: string;
  answer: string;
  bodyMd: string;
  author: string;
  reviewedBy: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
};

const select = {
  slug: true, title: true, description: true, answer: true, bodyMd: true,
  author: true, reviewedBy: true, publishedAt: true, updatedAt: true,
} as const;

/** Published Knowledge Center articles — the anonymous tier's only article read path. */
export const PublicArticleService = {
  async listPublished(brandKey: string): Promise<PublicArticleDTO[]> {
    return db.article.findMany({
      where: { brandKey, published: true },
      orderBy: { publishedAt: "desc" },
      take: 100,
      select,
    });
  },

  async getBySlug(brandKey: string, slug: string): Promise<PublicArticleDTO | null> {
    if (!slug) return null;
    return db.article.findFirst({ where: { brandKey, slug, published: true }, select });
  },
};
