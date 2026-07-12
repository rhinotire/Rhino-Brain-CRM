import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PublicArticleService } from "@rhino/services";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";
import { BRAND_KEY } from "@/lib/brand";

export const revalidate = 300;

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const a = await PublicArticleService.getBySlug(BRAND_KEY, params.slug);
  if (!a) return {};
  return { title: a.title, description: a.description, alternates: { canonical: `/knowledge/${params.slug}` } };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const a = await PublicArticleService.getBySlug(BRAND_KEY, params.slug);
  if (!a) notFound();
  const updated = a.updatedAt.toISOString().slice(0, 10);

  return (
    <article className="mx-auto max-w-3xl pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/knowledge">Knowledge</Link> / {a.title}
      </nav>
      <h1 className="mt-2 text-3xl font-black leading-tight">{a.title}</h1>
      <div className="mt-3 text-xs text-slate-500">
        By {a.author}{a.reviewedBy ? ` · Reviewed by ${a.reviewedBy}` : ""} · Updated {updated}
      </div>

      {/* GEO: direct answer first (docs/seo-requirements.md) */}
      <p className="mt-6 rounded-xl border-l-4 border-brand bg-slate-50 p-4 text-base font-medium">{a.answer}</p>

      <div className="mt-6 space-y-4 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:font-semibold [&_a]:text-brand-dark [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-bold [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.bodyMd}</ReactMarkdown>
      </div>

      <div className="mt-10 rounded-xl bg-slate-50 p-6 text-center">
        <div className="font-bold">Need wholesale pricing on these tires?</div>
        <Link href="/quote" className="mt-3 inline-block rounded-lg bg-brand px-5 py-3 text-sm font-bold text-ink">
          Get a Wholesale Quote
        </Link>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: a.title,
          description: a.description,
          author: { "@type": "Organization", name: a.author },
          dateModified: updated,
          ...(a.publishedAt ? { datePublished: a.publishedAt.toISOString().slice(0, 10) } : {}),
          publisher: { "@type": "Organization", name: SITE.name },
          mainEntityOfPage: `${SITE.url}/knowledge/${a.slug}`,
        }}
      />
    </article>
  );
}
