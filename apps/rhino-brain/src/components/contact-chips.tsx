/**
 * Read-only decision-maker list (name · title · email · phone · LinkedIn),
 * shown wherever a prospect's contacts should stay visible after it has been
 * claimed — "New Leads to Work" on My Work and the pipeline cards. Purely
 * presentational so it renders inside server components; the interactive
 * version with click-to-call lives in prospect-work-list.tsx.
 */
export type ContactChip = {
  name: string;
  title?: string | null;
  email?: string | null;
  emailStatus?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
};

/** Pull a contacts array out of a Lead.meta JSON blob, tolerating bad shapes. */
export function contactsFromMeta(meta: unknown): ContactChip[] {
  const raw = (meta as { contacts?: unknown } | null)?.contacts;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is ContactChip => !!c && typeof (c as ContactChip).name === "string");
}

export function ContactChips({ contacts }: { contacts: ContactChip[] }) {
  if (contacts.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-0.5 rounded-md border border-emerald-200 bg-emerald-50/50 px-2 py-1.5">
      {contacts.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
          <span className="font-semibold text-slate-800">{c.name}</span>
          {c.title && <span className="rounded bg-emerald-100 px-1 py-0.5 font-semibold text-emerald-800">{c.title}</span>}
          {c.email && (
            <a href={`mailto:${c.email}`} className="text-slate-700 hover:underline">
              ✉ {c.email}{c.emailStatus === "verified" || c.emailStatus === "valid" ? " ✓" : ""}
            </a>
          )}
          {c.phone && <a href={`tel:${c.phone}`} className="text-slate-700 hover:underline">☎ {c.phone}</a>}
          {c.linkedinUrl && (
            <a href={c.linkedinUrl.startsWith("http") ? c.linkedinUrl : `https://${c.linkedinUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">in↗</a>
          )}
        </div>
      ))}
    </div>
  );
}
