"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveArticle } from "@/actions/articles";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm";
const label = "mt-4 block text-sm font-semibold";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="mt-6 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? "Saving…" : "Save Article"}
    </button>
  );
}

export type ArticleFormValues = {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  answer?: string;
  bodyMd?: string;
  author?: string;
  reviewedBy?: string | null;
  published?: boolean;
};

export function ArticleForm({ article }: { article: ArticleFormValues }) {
  const [state, action] = useFormState(saveArticle, {} as { ok?: boolean; error?: string });
  return (
    <form action={action} className="max-w-3xl">
      {article.id && <input type="hidden" name="id" value={article.id} />}

      <label className={label} htmlFor="a-title">Title * <span className="font-normal text-slate-400">— one clear question or topic, ≤60 characters is ideal</span></label>
      <input id="a-title" name="title" required defaultValue={article.title} className={input}
        placeholder='e.g. "How to Read Trailer Tire Date Codes (DOT) — and When to Replace"' />

      <label className={label} htmlFor="a-slug">URL slug <span className="font-normal text-slate-400">— leave empty to auto-generate from the title</span></label>
      <input id="a-slug" name="slug" defaultValue={article.slug} className={input} placeholder="tire-date-codes-explained" />

      <label className={label} htmlFor="a-desc">Meta description * <span className="font-normal text-slate-400">— shows in Google results, 100–155 characters</span></label>
      <textarea id="a-desc" name="description" required rows={2} defaultValue={article.description} className={input} />

      <label className={label} htmlFor="a-answer">Direct answer * <span className="font-normal text-slate-400">— 2–3 sentences that fully answer the title question; shown in a gold box at the top; this is what Google & AI quote</span></label>
      <textarea id="a-answer" name="answer" required rows={3} defaultValue={article.answer} className={input} />

      <label className={label} htmlFor="a-body">Body * <span className="font-normal text-slate-400">— Markdown format, see cheatsheet below</span></label>
      <textarea id="a-body" name="bodyMd" required rows={18} defaultValue={article.bodyMd} className={`${input} font-mono text-xs`} />
      <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        <span className="font-bold">Markdown cheatsheet:</span> <code>## Heading</code> for sections ·
        <code>**bold**</code> · <code>- item</code> for lists · tables:
        <pre className="mt-1 font-mono">{`| Size | Load Range |\n|---|---|\n| ST205/75R15 | E |`}</pre>
      </div>

      <div className="grid gap-x-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="a-author">Author</label>
          <input id="a-author" name="author" defaultValue={article.author ?? "Rhino Tire USA Wholesale Team"} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="a-rev">Reviewed by <span className="font-normal text-slate-400">(optional, adds credibility)</span></label>
          <input id="a-rev" name="reviewedBy" defaultValue={article.reviewedBy ?? ""} className={input} placeholder="William Yi, Owner" />
        </div>
      </div>

      <label className="mt-5 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="published" defaultChecked={article.published} />
        Published (visible on the website)
      </label>

      {state.error && <p className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}
      <Submit />
    </form>
  );
}
