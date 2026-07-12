import type { Metadata } from "next";
import Link from "next/link";
import { PublicArticleService } from "@rhino/services";
import { BRAND_KEY } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Knowledge Center — Trailer & Commercial Tire Guides",
  description:
    "Practical tire guides from a wholesale distributor: load ranges, ST tire selection, sizing and inventory planning for dealers.",
  alternates: { canonical: "/knowledge" },
};

export const revalidate = 300; // new articles published in the CRM appear within minutes

export default async function KnowledgeHub() {
  const articles = await PublicArticleService.listPublished(BRAND_KEY);
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Knowledge
      </nav>
      <h1 className="mt-2 text-2xl font-black">Knowledge Center</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Written by our wholesale team from real distribution data — no filler.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {articles.map((a) => (
          <Link key={a.slug} href={`/knowledge/${a.slug}`} className="rounded-xl border border-slate-200 p-6 hover:border-brand">
            <div className="text-lg font-bold leading-snug">{a.title}</div>
            <p className="mt-2 text-sm text-slate-600">{a.answer.slice(0, 150)}…</p>
            <div className="mt-3 text-xs text-slate-400">Updated {a.updatedAt.toISOString().slice(0, 10)}</div>
          </Link>
        ))}
        {articles.length === 0 && (
          <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">Articles are on the way — check back soon.</p>
        )}
      </div>
    </div>
  );
}
