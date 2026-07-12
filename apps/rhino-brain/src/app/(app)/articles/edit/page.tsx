import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { ArticleForm } from "@/components/article-form";

export const dynamic = "force-dynamic";

export default async function ArticleEditPage({ searchParams }: { searchParams: { id?: string } }) {
  await requireManager();
  let article = null;
  if (searchParams.id) {
    article = await db.article.findUnique({ where: { id: searchParams.id } });
    if (!article) notFound();
  }

  return (
    <div className="space-y-3">
      <nav className="text-xs text-slate-500">
        <Link href="/articles" className="hover:underline">Knowledge Center</Link> / {article ? "Edit" : "New Article"}
      </nav>
      <h1 className="text-xl font-bold">{article ? article.title : "New Article"}</h1>
      {article?.published && (
        <p className="text-xs text-slate-500">
          Live at <span className="font-mono">/knowledge/{article.slug}</span> — changes appear within ~5 minutes of saving.
        </p>
      )}
      <ArticleForm article={article ?? {}} />
    </div>
  );
}
