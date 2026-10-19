/**
 * networkMatching.ts — Two-Way Recruiter, Network & Consultancy Matching Service
 *
 * Implements:
 *   1. Mode 1: Exact Mutual Matches (Direct Recruiters & Hiring Managers with active headcount)
 *   2. Mode 2: Either-Or Flexible Matches (Alumni Referral Bridges & Ex-Colleagues)
 *   3. Mode 3: Domain-Specialized Recruitment Consultancies (Agencies representing top talent to multiple clients)
 *   4. AI-Powered High-Conversion Outreach Pitches tailored to each archetype
 */

import { generateJson } from "./ai.js";
import type { ResumeData } from "./resume/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatchMode = "mutual_exact" | "either_or_referral" | "consultancy_partner";

export interface RecruiterTarget {
  id: string;
  roleType: "Lead Technical Recruiter" | "Hiring Manager / Engineering Lead" | "Head of Talent / Founder";
  targetTitle: string;
  company: string;
  department: string;
  matchMode: "mutual_exact";
  urgency: "Active Mandate (Direct Headcount)" | "Priority Pipeline";
  fitReason: string;
  linkedinSearchUrl: string;
  suggestedAction: string;
}

export interface AlumniNetworkBridge {
  id: string;
  bridgeType: "University Alumni" | "Ex-Company Colleague";
  sourceName: string; // e.g. "UC Berkeley", "Ex-Amazon"
  targetCompany: string;
  targetTitle: string;
  matchMode: "either_or_referral";
  referralImpactScore: "High (4x-10x Callback Rate)" | "Medium";
  fitReason: string;
  linkedinSearchUrl: string;
  warmIntroAngle: string;
}

export interface ConsultancyMatch {
  id: string;
  firmName: string;
  tier: "Tech Unicorn Boutique" | "Elite AI Search" | "Executive & Leadership" | "Global Tech Staffing";
  specialization: string;
  regions: string[];
  matchMode: "consultancy_partner";
  fitReason: string;
  website: string;
  leadSearchUrl: string;
  agencyPitchAngle: string;
}

export interface GeneratedPitches {
  recruiterConnectionNote: string; // Max 300 chars for LinkedIn connection
  recruiterInMail: string;         // Comprehensive InMail / Email with metrics
  alumniWarmReferralNote: string;  // Respectful alumni referral inquiry
  consultancyIntroBrief: string;   // High-impact candidate brief for headhunters
}

export interface NetworkMatchingResult {
  targetCompany: string;
  targetRole: string;
  candidateSeniority: string;
  candidateTopSkills: string[];
  mutualMatches: RecruiterTarget[];
  networkBridges: AlumniNetworkBridge[];
  consultancies: ConsultancyMatch[];
  pitches: GeneratedPitches;
}

// ---------------------------------------------------------------------------
// Curated Directory of Specialized Recruitment Consultancies
// ---------------------------------------------------------------------------

interface ConsultancyDirectoryEntry {
  id: string;
  name: string;
  tier: ConsultancyMatch["tier"];
  specialization: string;
  domains: string[]; // e.g. "ai_ml", "fintech", "fullstack", "cloud", "leadership"
  regions: string[];
  minSeniority: "mid" | "senior" | "lead" | "executive";
  website: string;
  linkedinQuery: string;
}

const CONSULTANCY_DIRECTORY: ConsultancyDirectoryEntry[] = [
  {
    id: "native",
    name: "Native",
    tier: "Tech Unicorn Boutique",
    specialization: "Fintech, E-commerce, High-Growth Indian Unicorns & Tier-1 Tech",
    domains: ["fintech", "fullstack", "cloud", "ai_ml", "leadership"],
    regions: ["India", "Global"],
    minSeniority: "mid",
    website: "https://nativeworld.com",
    linkedinQuery: '("Partner" OR "Director" OR "Consultant") "Native" "Tech"',
  },
  {
    id: "riviera_partners",
    name: "Riviera Partners",
    tier: "Tech Unicorn Boutique",
    specialization: "Silicon Valley Engineering Leadership & Elite AI Startups (OpenAI, Uber, Snowflake)",
    domains: ["ai_ml", "cloud", "fullstack", "leadership"],
    regions: ["US", "Global"],
    minSeniority: "senior",
    website: "https://rivierapartners.com",
    linkedinQuery: '("Partner" OR "Recruiter") "Riviera Partners"',
  },
  {
    id: "daversa",
    name: "Daversa Partners",
    tier: "Elite AI Search",
    specialization: "Frontier AI Labs, Deep-Tech Startups & Venture-Backed Seed/Series A-C",
    domains: ["ai_ml", "cloud", "fullstack"],
    regions: ["US", "Global"],
    minSeniority: "senior",
    website: "https://daversapartners.com",
    linkedinQuery: '("Partner" OR "Managing Director") "Daversa Partners"',
  },
  {
    id: "longhouse",
    name: "Longhouse Consulting",
    tier: "Tech Unicorn Boutique",
    specialization: "India Tech Ecosystem, Software Engineering, Architecture & Data Platforms",
    domains: ["fullstack", "cloud", "fintech"],
    regions: ["India"],
    minSeniority: "mid",
    website: "https://longhouse.in",
    linkedinQuery: '("Consultant" OR "Partner") "Longhouse Consulting"',
  },
  {
    id: "true_search",
    name: "True Search",
    tier: "Executive & Leadership",
    specialization: "Global Tech Scaleups, Staff+, VP of Engineering & CTO Placements",
    domains: ["leadership", "ai_ml", "cloud", "fintech"],
    regions: ["US", "Europe", "India", "Global"],
    minSeniority: "lead",
    website: "https://truesearch.com",
    linkedinQuery: '("Partner" OR "Principal") "True Search" "Technology"',
  },
  {
    id: "abc_consultants",
    name: "ABC Consultants",
    tier: "Global Tech Staffing",
    specialization: "Enterprise Tech, Global Capability Centers (GCCs), MNC Technology Labs",
    domains: ["fullstack", "cloud", "fintech", "leadership"],
    regions: ["India"],
    minSeniority: "mid",
    website: "https://abcconsultants.in",
    linkedinQuery: '("Consultant" OR "Practice Head") "ABC Consultants" "Technology"',
  },
  {
    id: "walkwater",
    name: "WalkWater Talent Advisors",
    tier: "Executive & Leadership",
    specialization: "GCCs, Product Engineering Centers & High-Growth Startups",
    domains: ["leadership", "cloud", "ai_ml"],
    regions: ["India", "US"],
    minSeniority: "senior",
    website: "https://walkwatertalent.com",
    linkedinQuery: '("Partner" OR "Principal") "WalkWater Talent"',
  },
  {
    id: "michael_page_tech",
    name: "Michael Page Technology",
    tier: "Global Tech Staffing",
    specialization: "MNC Technology Hubs, Cloud & Distributed Software Systems",
    domains: ["fullstack", "cloud", "ai_ml", "fintech"],
    regions: ["India", "Europe", "US", "Global"],
    minSeniority: "mid",
    website: "https://michaelpage.co.in",
    linkedinQuery: '("Recruitment Consultant" OR "Manager") "Michael Page" "Technology"',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLinkedInSearchUrl(query: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

function inferCandidateDomains(skills: string[], title: string): string[] {
  const combined = `${skills.join(" ")} ${title}`.toLowerCase();
  const domains: string[] = [];

  if (/ai|ml|machine learning|llm|pytorch|langchain|rag|deep learning/i.test(combined)) {
    domains.push("ai_ml");
  }
  if (/payment|fintech|banking|transaction|upi|credit|ledger|trading/i.test(combined)) {
    domains.push("fintech");
  }
  if (/react|frontend|javascript|typescript|next\.?js|ui|ux/i.test(combined)) {
    domains.push("fullstack");
  }
  if (/backend|node|go|golang|kafka|kubernetes|docker|aws|distributed|microservice/i.test(combined)) {
    domains.push("cloud");
  }
  if (/lead|staff|principal|manager|director|architect|head/i.test(combined)) {
    domains.push("leadership");
  }
  if (domains.length === 0) domains.push("fullstack");
  return domains;
}

function estimateSeniority(resume: ResumeData, targetRole: string): string {
  const years = resume.experience.length;
  const title = (targetRole || resume.experience[0]?.title || "").toLowerCase();

  if (/lead|staff|principal|director|manager/i.test(title) || years >= 7) return "Senior / Lead";
  if (/senior|sr/i.test(title) || years >= 4) return "Senior";
  if (years >= 2) return "Mid-Level";
  return "Junior / Associate";
}

// ---------------------------------------------------------------------------
// Core Matching Generator
// ---------------------------------------------------------------------------

export async function matchRecruiterNetworkAndConsultancies(params: {
  resumeData: ResumeData;
  targetCompany: string;
  targetRole?: string;
  location?: string;
}): Promise<NetworkMatchingResult> {
  const { resumeData, targetCompany, location = "India" } = params;
  const role = params.targetRole || resumeData.experience[0]?.title || "Software Engineer";

  const skillsList = resumeData.skills.flatMap((s) => s.items);
  const topSkills = skillsList.slice(0, 8);
  const seniority = estimateSeniority(resumeData, role);
  const candidateDomains = inferCandidateDomains(skillsList, role);

  // 1. Generate Mutual Exact Recruiter Matches (Direct Headcount Owners)
  const mutualMatches: RecruiterTarget[] = [
    {
      id: "recruiter_ta",
      roleType: "Lead Technical Recruiter",
      targetTitle: `Technical Recruiter @ ${targetCompany}`,
      company: targetCompany,
      department: "Talent Acquisition / Engineering Recruiting",
      matchMode: "mutual_exact",
      urgency: "Active Mandate (Direct Headcount)",
      fitReason: `Owns active hiring pipeline for ${role} roles. Evaluates incoming candidate profiles against team requirements.`,
      linkedinSearchUrl: buildLinkedInSearchUrl(`("Technical Recruiter" OR "Talent Partner" OR "Recruiter") "${targetCompany}" "${location}"`),
      suggestedAction: "Send 300-char connection request citing the exact role and 2 core matching metrics.",
    },
    {
      id: "hiring_manager_em",
      roleType: "Hiring Manager / Engineering Lead",
      targetTitle: `Engineering Manager / Team Lead @ ${targetCompany}`,
      company: targetCompany,
      department: "Software Engineering & Architecture",
      matchMode: "mutual_exact",
      urgency: "Active Mandate (Direct Headcount)",
      fitReason: `Direct headcount owner who makes technical hiring decisions for ${role} teams. High response rate to stack-aligned messages.`,
      linkedinSearchUrl: buildLinkedInSearchUrl(`("Engineering Manager" OR "EM" OR "Tech Lead" OR "Software Engineering Manager") "${targetCompany}"`),
      suggestedAction: "Send technical pitch highlighting architectural scale and metrics matching their stack.",
    },
  ];

  // If high-seniority or startup, add Founder / Head of Engineering
  if (/lead|staff|principal|director/i.test(seniority) || /startup|ai/i.test(targetCompany.toLowerCase())) {
    mutualMatches.push({
      id: "head_of_eng",
      roleType: "Head of Talent / Founder",
      targetTitle: `VP of Engineering / Founder @ ${targetCompany}`,
      company: targetCompany,
      department: "Executive Leadership",
      matchMode: "mutual_exact",
      urgency: "Active Mandate (Direct Headcount)",
      fitReason: "Drives strategic engineering growth and actively recruits Staff+ engineers directly.",
      linkedinSearchUrl: buildLinkedInSearchUrl(`("VP Engineering" OR "Head of Engineering" OR "Founder" OR "CTO") "${targetCompany}"`),
      suggestedAction: "Reach out with high-level ownership summary and track record of delivering scale.",
    });
  }

  // 2. Generate Either-Or Flexible Referral Bridges (Alumni & Ex-Colleagues)
  const networkBridges: AlumniNetworkBridge[] = [];

  // University Alumni Bridge
  const primarySchool = resumeData.education[0]?.school;
  if (primarySchool) {
    networkBridges.push({
      id: "alumni_university",
      bridgeType: "University Alumni",
      sourceName: primarySchool,
      targetCompany: targetCompany,
      targetTitle: `Alumni Software Engineer @ ${targetCompany}`,
      matchMode: "either_or_referral",
      referralImpactScore: "High (4x-10x Callback Rate)",
      fitReason: `Shared alma mater (${primarySchool}) builds instant trust. Employees receive internal referral bonuses for referring qualified peers.`,
      linkedinSearchUrl: buildLinkedInSearchUrl(`("Software Engineer" OR "Developer" OR "Engineer") "${targetCompany}" "${primarySchool}"`),
      warmIntroAngle: `Bond over shared campus background at ${primarySchool} and ask for an insider referral to the hiring portal.`,
    });
  }

  // Ex-Company Colleague Bridge
  const pastCompanies = resumeData.experience.slice(1).map((e) => e.company).filter(Boolean);
  const primaryPastCompany = pastCompanies[0];
  if (primaryPastCompany) {
    networkBridges.push({
      id: "alumni_ex_company",
      bridgeType: "Ex-Company Colleague",
      sourceName: `Ex-${primaryPastCompany}`,
      targetCompany: targetCompany,
      targetTitle: `Engineer (Ex-${primaryPastCompany}) @ ${targetCompany}`,
      matchMode: "either_or_referral",
      referralImpactScore: "High (4x-10x Callback Rate)",
      fitReason: `Engineers who previously worked at ${primaryPastCompany} understand your engineering standards and can vouch for you.`,
      linkedinSearchUrl: buildLinkedInSearchUrl(`("Software Engineer" OR "Developer") "${targetCompany}" "${primaryPastCompany}"`),
      warmIntroAngle: `Reference your shared background at ${primaryPastCompany} and ask about the team culture at ${targetCompany}.`,
    });
  }

  // General Domain Peer Bridge (if no school/past company)
  if (networkBridges.length === 0) {
    networkBridges.push({
      id: "peer_network",
      bridgeType: "University Alumni",
      sourceName: "Domain Peer Network",
      targetCompany: targetCompany,
      targetTitle: `Senior Engineer @ ${targetCompany}`,
      matchMode: "either_or_referral",
      referralImpactScore: "High (4x-10x Callback Rate)",
      fitReason: `Internal peers working in ${candidateDomains[0] || "tech"} at ${targetCompany} can submit a direct internal referral.`,
      linkedinSearchUrl: buildLinkedInSearchUrl(`("Senior Software Engineer" OR "Staff Software Engineer") "${targetCompany}" "${topSkills[0] || "Software"}"`),
      warmIntroAngle: "Connect engineer-to-engineer on tech stack challenges before requesting a referral.",
    });
  }

  // 3. Match Specialized Recruitment Consultancies (Represent talent across multiple clients)
  const matchedConsultancies = CONSULTANCY_DIRECTORY.filter((c) => {
    const domainMatch = c.domains.some((d) => candidateDomains.includes(d));
    return domainMatch;
  }).slice(0, 4);

  const consultancies: ConsultancyMatch[] = matchedConsultancies.map((c) => ({
    id: c.id,
    firmName: c.name,
    tier: c.tier,
    specialization: c.specialization,
    regions: c.regions,
    matchMode: "consultancy_partner",
    fitReason: `Specializes in ${c.specialization}. Headhunters hold exclusive hiring retainers with tech companies looking for your exact skills (${topSkills.slice(0, 3).join(", ")}).`,
    website: c.website,
    leadSearchUrl: buildLinkedInSearchUrl(c.linkedinQuery),
    agencyPitchAngle: `Send executive candidate profile brief so the partner can represent you across 3-5 concurrent unicorn mandates.`,
  }));

  // 4. Generate AI Pitches for Each Channel using Gemini
  const pitches = await generateChannelPitches({
    candidateName: resumeData.contact.name || "Candidate",
    targetCompany,
    targetRole: role,
    topSkills,
    seniority,
    almaMater: primarySchool || "University",
    bullets: resumeData.experience[0]?.bullets || [],
  });

  return {
    targetCompany,
    targetRole: role,
    candidateSeniority: seniority,
    candidateTopSkills: topSkills,
    mutualMatches,
    networkBridges,
    consultancies,
    pitches,
  };
}

// ---------------------------------------------------------------------------
// AI Channel Outreach Pitch Generator
// ---------------------------------------------------------------------------

const PITCH_SCHEMA = {
  type: "object",
  properties: {
    recruiterConnectionNote: { type: "string" },
    recruiterInMail: { type: "string" },
    alumniWarmReferralNote: { type: "string" },
    consultancyIntroBrief: { type: "string" },
  },
  required: [
    "recruiterConnectionNote",
    "recruiterInMail",
    "alumniWarmReferralNote",
    "consultancyIntroBrief",
  ],
};

async function generateChannelPitches(context: {
  candidateName: string;
  targetCompany: string;
  targetRole: string;
  topSkills: string[];
  seniority: string;
  almaMater: string;
  bullets: string[];
}): Promise<GeneratedPitches> {
  const prompt = `You are a Principal Career Strategist and Technical Headhunter.
Write 4 distinct, high-converting outreach messages tailored to each hiring archetype:

1. recruiterConnectionNote:
   - For LinkedIn connection request to the Lead Technical Recruiter at ${context.targetCompany}.
   - CRITICAL CONSTRAINT: Under 300 characters strictly (LinkedIn limit).
   - Direct, high-signal, mentions target role (${context.targetRole}) and 1 key quantifiable metric.

2. recruiterInMail:
   - For InMail / Email to the Hiring Manager / Engineering Manager at ${context.targetCompany}.
   - Length: 120-150 words.
   - 3 short paragraphs: (a) Why them + role fit, (b) Proven quantifiable impact & technical stack (${context.topSkills.slice(0, 4).join(", ")}), (c) Low-friction ask (15-min chat).

3. alumniWarmReferralNote:
   - For reaching out to an Alumni or Former Colleague working at ${context.targetCompany}.
   - Warm, respectful, mentions shared background (${context.almaMater}).
   - Asks for advice and internal referral for the open ${context.targetRole}.

4. consultancyIntroBrief:
   - For introducing the candidate to a partner at a Specialized Recruitment Consultancy.
   - Crisp executive talent brief: Seniority (${context.seniority}), Core Specializations, Scale Handled, Target Requisition.`;

  const inputContext = `Candidate: ${context.candidateName}
Target Company: ${context.targetCompany}
Target Role: ${context.targetRole}
Seniority: ${context.seniority}
Top Skills: ${context.topSkills.join(", ")}
Key Achievement: ${context.bullets[0] ?? "Delivered scalable microservices with high performance."}`;

  try {
    return await generateJson<GeneratedPitches>(prompt, inputContext, PITCH_SCHEMA, { tier: "smart" });
  } catch {
    // Robust fallback if AI call fails
    return {
      recruiterConnectionNote: `Hi! I saw the ${context.targetRole} opening at ${context.targetCompany}. With extensive background in ${context.topSkills.slice(0, 3).join(", ")}, I've delivered scalable architectures with proven impact. Would love to connect!`,
      recruiterInMail: `Hi,\n\nI noticed ${context.targetCompany} is scaling the engineering team for ${context.targetRole}. Given my background delivering high-scale systems using ${context.topSkills.slice(0, 4).join(", ")}, I believe my experience aligns strongly with your current roadmap.\n\nRecently, I ${context.bullets[0] || "architected high-availability services serving substantial daily traffic"}.\n\nWould you be open to a brief 10-minute introductory conversation this week?\n\nBest regards,\n${context.candidateName}`,
      alumniWarmReferralNote: `Hi! Saw that you also graduated from ${context.almaMater} and are now working at ${context.targetCompany}. I'm applying for the ${context.targetRole} opening and noticed strong overlap with your team's stack. Would you be open to a quick chat or sharing an internal referral?\n\nThanks so much!`,
      consultancyIntroBrief: `Candidate Profile Brief:\n• Role: ${context.seniority} ${context.targetRole}\n• Core Stack: ${context.topSkills.join(", ")}\n• Target: Growth tech unicorns and Tier-1 firms at ${context.targetCompany}.\n• Open to strategic opportunities.`,
    };
  }
}
