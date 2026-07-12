"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Create or update a Knowledge Center article (managers+). */
export async function saveArticle(_prev: unknown, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  const bodyMd = String(formData.get("bodyMd") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim() || "Rhino Tire USA Wholesale Team";
  const reviewedBy = String(formData.get("reviewedBy") ?? "").trim() || null;
  const publish = formData.get("published") === "on";
  let slug = slugify(String(formData.get("slug") ?? "")) || slugify(title);

  if (title.length < 8) return { error: "Title is too short." };
  if (description.length < 30) return { error: "Meta description is too short (aim for 100–155 characters)." };
  if (answer.length < 50) return { error: "Direct answer is too short — write 2–3 full sentences (this is what Google/AI quote)." };
  if (bodyMd.length < 100) return { error: "Body is too short." };
  if (!slug) return { error: "Slug could not be generated." };

  const clash = await db.article.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (clash) return { error: `URL slug "${slug}" is already used by another article.` };

  const data = {
    slug, title, description, answer, bodyMd, author, reviewedBy,
    published: publish,
  };
  if (id) {
    const existing = await db.article.findUnique({ where: { id }, select: { published: true, publishedAt: true } });
    if (!existing) return { error: "Article not found." };
    await db.article.update({
      where: { id },
      data: { ...data, publishedAt: publish ? existing.publishedAt ?? new Date() : existing.publishedAt },
    });
  } else {
    await db.article.create({ data: { ...data, brandKey: "RHINO", publishedAt: publish ? new Date() : null } });
  }
  revalidatePath("/articles");
  redirect("/articles?saved=1");
}

export async function toggleArticlePublished(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const a = await db.article.findUnique({ where: { id }, select: { published: true, publishedAt: true } });
  if (!a) return { error: "Not found." };
  await db.article.update({
    where: { id },
    data: { published: !a.published, publishedAt: !a.published ? a.publishedAt ?? new Date() : a.publishedAt },
  });
  revalidatePath("/articles");
  return { ok: true };
}
