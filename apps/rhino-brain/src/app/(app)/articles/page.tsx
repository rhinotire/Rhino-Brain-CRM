import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Table, THead, EmptyRow } from "@/components/ui/primitives";
import { ArticlePublishToggle } from "@/components/article-publish-toggle";

export const dynamic = "force-dynamic";

/** Knowledge Center management — write articles here, publish to the website. */
export default async function ArticlesPage() {
  await requireManager();
  const articles = await db.article.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Knowledge Center <span className="text-sm font-normal text-slate-400">(website articles)</span></h1>
        <Link href="/articles/edit" className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">+ New Article</Link>
      </div>
      <p className="text-sm text-slate-500">
        Published articles appear at <span className="font-mono">rhinotiresusa.com/knowledge</span> within ~5 minutes. Good articles answer one
        question, open with a 2–3 sentence direct answer, and include a real data table — that&apos;s what search engines and AI quote.
      </p>

      <Table>
        <THead cols={["Title", "URL slug", "Author", "Updated", "Status"]} />
        <tbody>
          {articles.map((a) => (
            <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium">
                <Link href={`/articles/edit?id=${a.id}`} className="text-blue-700 hover:underline">{a.title}</Link>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-slate-500">/knowledge/{a.slug}</td>
              <td className="px-3 py-2 text-slate-600">{a.author}</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{a.updatedAt.toLocaleDateString()}</td>
              <td className="px-3 py-2"><ArticlePublishToggle id={a.id} published={a.published} /></td>
            </tr>
          ))}
          {articles.length === 0 && <EmptyRow colSpan={5} message="No articles yet — click New Article." />}
        </tbody>
      </Table>
    </div>
  );
}
