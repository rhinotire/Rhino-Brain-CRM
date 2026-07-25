/**
 * Decision-maker contact enrichment via Apollo (primary) + RocketReach
 * (email fallback). This is where "Purchaser / President / Owner" names come
 * from — B2B databases built on LinkedIn data; company websites rarely list
 * them.
 *
 * Cost model (why the flow is shaped this way):
 *  - Apollo people search: free, returns names/titles/LinkedIn but NO emails
 *  - Apollo people/match: 1 credit per person → only called for top matches
 *  - RocketReach lookup: 1 export credit → only when Apollo found no email
 */
export type ProspectContact = {
  name: string;
  title: string;
  email: string | null;
  emailStatus: string | null; // "verified" | "unverified" | null
  phone: string | null;
  linkedinUrl: string | null;
  source: "APOLLO" | "ROCKETREACH";
};

// Roles worth paying a credit for, in priority order (owner request:
// purchaser / president / owner first).
export const DECISION_TITLES = [
  "Purchasing Manager", "Purchasing", "Buyer", "Procurement",
  "Owner", "President", "CEO", "General Manager",
  "Parts Manager", "Fleet Manager", "Category Manager",
];
const SENIORITIES = ["owner", "founder", "c_suite", "vp", "director", "manager"];
const MAX_REVEALS = 3; // Apollo credits cap per company

type ApolloPerson = {
  id?: string;
  first_name?: string; last_name?: string; last_name_obfuscated?: string; name?: string;
  title?: string; linkedin_url?: string;
};

/** Plans that can't reveal an email return a placeholder like
 * "email_not_unlocked@domain.com" — treat it as no email. */
const isRealEmail = (e: unknown): e is string =>
  typeof e === "string" && e.includes("@") && !e.startsWith("email_not_unlocked");

export async function findDecisionMakers(
  input: { companyName: string; domain: string | null },
  keys: { apolloKey?: string; rocketReachKey?: string },
  fetchFn: typeof fetch = fetch
): Promise<{ contacts: ProspectContact[]; apolloCredits: number; rocketReachLookups: number }> {
  if (!keys.apolloKey) throw new Error("APOLLO_API_KEY not configured");
  let apolloCredits = 0;
  let rocketReachLookups = 0;

  // 1. Free search: who works there in a buying role?
  const searchRes = await fetchFn("https://api.apollo.io/api/v1/mixed_people/api_search", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Api-Key": keys.apolloKey },
    body: JSON.stringify({
      ...(input.domain ? { q_organization_domains_list: [input.domain] } : { q_organization_name: input.companyName }),
      person_seniorities: SENIORITIES,
      per_page: 6,
      page: 1,
    }),
  });
  if (!searchRes.ok) throw new Error(`Apollo search ${searchRes.status}: ${(await searchRes.text()).slice(0, 200)}`);
  const searchBody = (await searchRes.json()) as { people?: ApolloPerson[] };
  const candidates = (searchBody.people ?? []).filter((p) => p.title);

  // Prioritize buying roles, then take the top few.
  const rank = (t: string) => {
    const i = DECISION_TITLES.findIndex((d) => t.toLowerCase().includes(d.toLowerCase()));
    return i === -1 ? DECISION_TITLES.length : i;
  };
  candidates.sort((a, b) => rank(a.title ?? "") - rank(b.title ?? ""));
  const top = candidates.slice(0, MAX_REVEALS);

  const contacts: ProspectContact[] = [];
  for (const p of top) {
    // Search obfuscates last names on some plans ("Lu***s") — the match-by-id
    // call below returns the real full name, LinkedIn URL and email.
    let fullName = p.name ?? [p.first_name, p.last_name ?? p.last_name_obfuscated].filter(Boolean).join(" ");
    let linkedinUrl = p.linkedin_url ?? null;
    let title = p.title ?? "";
    if (!fullName && !p.id) continue;
    let email: string | null = null;
    let emailStatus: string | null = null;
    let phone: string | null = null;
    let source: ProspectContact["source"] = "APOLLO";

    // 2. Paid reveal: Apollo enrichment by person id (1 credit when found)
    try {
      const matchRes = await fetchFn("https://api.apollo.io/api/v1/people/match", {
        method: "POST",
        headers: { "content-type": "application/json", "X-Api-Key": keys.apolloKey },
        body: JSON.stringify(
          p.id
            ? { id: p.id, reveal_personal_emails: false }
            : { name: fullName, organization_name: input.companyName, ...(input.domain ? { domain: input.domain } : {}), reveal_personal_emails: false }
        ),
      });
      if (matchRes.ok) {
        const m = (await matchRes.json()) as {
          person?: { name?: string | null; title?: string | null; linkedin_url?: string | null; email?: string | null; email_status?: string | null; sanitized_phone?: string | null };
        };
        if (m.person?.name) fullName = m.person.name;
        if (m.person?.title) title = m.person.title;
        if (m.person?.linkedin_url) linkedinUrl = m.person.linkedin_url;
        if (isRealEmail(m.person?.email)) {
          email = m.person!.email!;
          emailStatus = m.person?.email_status ?? null;
          apolloCredits++;
        }
        phone = m.person?.sanitized_phone ?? null;
      }
    } catch { /* fall through to RocketReach */ }
    if (!fullName) continue;

    // 3. Fallback: RocketReach lookup by name + employer
    if (!email && keys.rocketReachKey) {
      try {
        const url = new URL("https://api.rocketreach.co/api/v2/person/lookup");
        url.searchParams.set("name", fullName);
        url.searchParams.set("current_employer", input.companyName);
        const rrRes = await fetchFn(url.toString(), { headers: { "Api-Key": keys.rocketReachKey } });
        if (rrRes.ok) {
          rocketReachLookups++;
          const rr = (await rrRes.json()) as { emails?: Array<{ email?: string; smtp_valid?: string }>; phones?: Array<{ number?: string }> };
          const best = rr.emails?.find((e) => e.smtp_valid === "valid") ?? rr.emails?.[0];
          if (best?.email) { email = best.email; emailStatus = best.smtp_valid ?? null; source = "ROCKETREACH"; }
          if (!phone) phone = rr.phones?.[0]?.number ?? null;
        }
      } catch { /* keep whatever we have */ }
    }

    contacts.push({
      name: fullName,
      title,
      email, emailStatus, phone,
      linkedinUrl,
      source,
    });
  }
  return { contacts, apolloCredits, rocketReachLookups };
}
