import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICLES } from "@/lib/articles";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

type Params = { slug: string };

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const a = ARTICLES.find((x) => x.slug === params.slug);
  if (!a) return {};
  return { title: a.title, description: a.description, alternates: { canonical: `/knowledge/${params.slug}` } };
}

export default function ArticlePage({ params }: { params: Params }) {
  const a = ARTICLES.find((x) => x.slug === params.slug);
  if (!a) notFound();

  return (
    <article className="mx-auto max-w-3xl pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/knowledge">Knowledge</Link> / {a.title}
      </nav>
      <h1 className="mt-2 text-3xl font-black leading-tight">{a.title}</h1>
      <div className="mt-3 text-xs text-slate-500">
        By {a.author} · Reviewed by {a.reviewedBy} · Updated {a.updated}
      </div>

      {/* GEO: direct answer first (docs/seo-requirements.md) */}
      <p className="mt-6 rounded-xl border-l-4 border-brand bg-slate-50 p-4 text-base font-medium">{a.answer}</p>

      <div className="prose-headings:font-bold prose-headings:text-lg mt-6 space-y-4 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold">
        {a.body}
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
          dateModified: a.updated,
          publisher: { "@type": "Organization", name: SITE.name },
          mainEntityOfPage: `${SITE.url}/knowledge/${a.slug}`,
        }}
      />
    </article>
  );
}
