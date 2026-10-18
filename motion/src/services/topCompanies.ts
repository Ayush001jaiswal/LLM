import type { MarketJob } from "./jobSearch.js";

export interface TopCompanyConfig {
  name: string;
  type: "greenhouse" | "ashby" | "lever";
  slug: string;
  badge: "⭐ Tier-1 Tech" | "🤖 Top AI Startup";
}

export const TOP_COMPANIES: TopCompanyConfig[] = [
  // --- Top Funded AI Startups ---
  { name: "Anthropic", type: "greenhouse", slug: "anthropic", badge: "🤖 Top AI Startup" },
  { name: "Perplexity AI", type: "ashby", slug: "perplexity", badge: "🤖 Top AI Startup" },
  { name: "Scale AI", type: "greenhouse", slug: "scaleai", badge: "🤖 Top AI Startup" },
  { name: "Together AI", type: "greenhouse", slug: "togetherai", badge: "🤖 Top AI Startup" },
  { name: "Cursor (Anysphere)", type: "ashby", slug: "anysphere", badge: "🤖 Top AI Startup" },
  { name: "Cohere", type: "ashby", slug: "cohere", badge: "🤖 Top AI Startup" },
  { name: "Mistral AI", type: "ashby", slug: "mistral", badge: "🤖 Top AI Startup" },
  { name: "LangChain", type: "greenhouse", slug: "langchain", badge: "🤖 Top AI Startup" },
  { name: "Hugging Face", type: "greenhouse", slug: "huggingface", badge: "🤖 Top AI Startup" },
  { name: "ElevenLabs", type: "greenhouse", slug: "elevenlabs", badge: "🤖 Top AI Startup" },

  // --- Tier-1 Tech Giants & Elite Unicorns ---
  { name: "Databricks", type: "greenhouse", slug: "databricks", badge: "⭐ Tier-1 Tech" },
  { name: "Stripe", type: "greenhouse", slug: "stripe", badge: "⭐ Tier-1 Tech" },
  { name: "Figma", type: "greenhouse", slug: "figma", badge: "⭐ Tier-1 Tech" },
  { name: "Notion", type: "ashby", slug: "notion", badge: "⭐ Tier-1 Tech" },
  { name: "Linear", type: "ashby", slug: "linear", badge: "⭐ Tier-1 Tech" },
  { name: "CRED", type: "lever", slug: "cred", badge: "⭐ Tier-1 Tech" },
  { name: "Razorpay", type: "greenhouse", slug: "razorpaysoftwareprivatelimited", badge: "⭐ Tier-1 Tech" },
];

// Well-known tier-1 names that come via Adzuna or external feeds
export const TIER1_NAMES = [
  "google",
  "meta",
  "flipkart",
  "groww",
  "cred",
  "uber",
  "intel",
  "databricks",
  "stripe",
  "anthropic",
  "perplexity",
  "scale ai",
  "razorpay",
  "figma",
  "notion",
  "apple",
  "microsoft",
  "amazon",
  "netflix",
];

export function getTierBadge(companyName: string): string | undefined {
  const norm = companyName.toLowerCase();
  if (/anthropic|perplexity|scale ai|together ai|cursor|anysphere|cohere|mistral|langchain|elevenlabs/i.test(norm)) {
    return "🤖 Top AI Startup";
  }
  if (TIER1_NAMES.some((t) => norm.includes(t))) {
    return "⭐ Tier-1 Tech";
  }
  return undefined;
}

/**
 * Queries a single company's official public ATS feed.
 */
async function fetchCompanyJobs(company: TopCompanyConfig, roleKeywords: string[]): Promise<MarketJob[]> {
  try {
    let url = "";
    if (company.type === "greenhouse") {
      url = `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`;
    } else if (company.type === "ashby") {
      url = `https://api.ashbyhq.com/posting-api/job-board/${company.slug}`;
    } else if (company.type === "lever") {
      url = `https://api.lever.co/v0/postings/${company.slug}?mode=json`;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];

    const data = await res.json();
    const rawList: any[] = Array.isArray(data) ? data : data.jobs ?? [];

    const matches = rawList.filter((j) => {
      const title = (j.title || j.text || "").toLowerCase();
      // Match specific role keywords or general engineering titles
      return (
        roleKeywords.some((k) => title.includes(k)) ||
        /engineer|developer|software|fullstack|frontend|backend|data|ai|ml|tech/i.test(title)
      );
    });

    return matches.slice(0, 4).map((j) => ({
      id: `${company.slug}_${j.id || Math.random()}`,
      title: j.title || j.text || "Engineering Opportunity",
      company: { display_name: company.name },
      location: {
        display_name:
          j.location?.name ||
          j.categories?.location ||
          (j.isRemote ? "Remote" : "Global / Remote"),
      },
      created: j.updated_at || j.createdAt || new Date().toISOString(),
      redirect_url: j.absolute_url || j.jobUrl || j.hostedUrl || `https://${company.slug}.com/careers`,
      description: (j.content || j.description || j.title || "").replace(/<[^>]+>/g, " ").slice(0, 1000),
      source: `${company.name} Careers`,
    }));
  } catch {
    return [];
  }
}

/**
 * Concurrently queries official ATS job boards of Top Tech & Top Funded AI Startups.
 */
export async function fetchTopTierAtsJobs(targetRole: string): Promise<MarketJob[]> {
  const keywords = targetRole
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const promises = TOP_COMPANIES.map((company) => fetchCompanyJobs(company, keywords));
  const settled = await Promise.allSettled(promises);

  return settled
    .filter((r): r is PromiseFulfilledResult<MarketJob[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}
