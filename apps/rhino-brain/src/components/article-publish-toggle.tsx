"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleArticlePublished } from "@/actions/articles";
import { useToast } from "@/components/ui/toast";

export function ArticlePublishToggle({ id, published }: { id: string; published: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button type="button" disabled={pending}
      title={published ? "Live on the website. Click to unpublish." : "Publish to the website"}
      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${published ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"}`}
      onClick={() => start(async () => {
        const res = await toggleArticlePublished(id);
        if (res.ok) { toast(published ? "Unpublished" : "Published to the website"); router.refresh(); }
        else toast(res.error ?? "Failed", "error");
      })}>
      {pending ? "…" : published ? "LIVE" : "draft"}
    </button>
  );
}
