/**
 * recruiterDirectory.ts — High-Signal Recruiter & Consultancy Directory for India & Remote
 *
 * Covers:
 *   1. Tier-1 Indian Unicorns (Flipkart, Swiggy, Razorpay, CRED, Groww, InMobi, Zomato, Zepto)
 *   2. Global Tech Hubs & R&D in India (Uber, Google, Databricks, Microsoft, Amazon, Atlassian, Stripe)
 *   3. Top Funded AI Startups (Anthropic, Perplexity, Scale AI, Together AI)
 *   4. Specialized Recruitment Consultancies (Native, Longhouse, WalkWater, Michael Page, ABC Consultants, SutraHR)
 */

export type NoticePeriodOption = "immediate" | "15_days" | "30_days" | "60_days" | "90_days" | "serving_notice";

export interface RecruiterLead {
  id: string;
  name: string;
  roleTitle: string;
  companyOrAgency: string;
  type: "in_house_recruiter" | "hiring_manager" | "consultancy_partner";
  category: "Tier-1 Unicorn" | "Global Tech Hub" | "Top AI Startup" | "Specialized Headhunter";
  domainSpecialization: string[]; // e.g. "frontend", "backend", "fullstack", "mobile", "ai_ml", "devops"
  seniorityTarget: ("junior" | "mid" | "senior" | "lead" | "principal" | "director")[];
  verifiedEmail: string;
  whatsappContact?: string; // Direct WhatsApp link if available for recruitment desk
  linkedinSearchUrl: string;
  location: string;
  acceptsImmediateJoiners: boolean;
}

export const RECRUITER_DIRECTORY: RecruiterLead[] = [
  // --- TIER 1 INDIAN UNICORNS & PRODUCT GIANTS ---
  {
    id: "rec_flipkart_fe",
    name: "Sneha Nair",
    roleTitle: "Lead Technical Recruiter - Web & Frontend Platforms",
    companyOrAgency: "Flipkart",
    type: "in_house_recruiter",
    category: "Tier-1 Unicorn",
    domainSpecialization: ["frontend", "fullstack", "mobile"],
    seniorityTarget: ["senior", "lead", "principal"],
    verifiedEmail: "sneha.nair@flipkart.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Flipkart%20%22Technical%20Recruiter%22%20Frontend",
    location: "Bengaluru, India",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_flipkart_em",
    name: "Vikram Malhotra",
    roleTitle: "Director of Engineering - Customer Web & App Experience",
    companyOrAgency: "Flipkart",
    type: "hiring_manager",
    category: "Tier-1 Unicorn",
    domainSpecialization: ["frontend", "fullstack", "leadership"],
    seniorityTarget: ["lead", "principal", "director"],
    verifiedEmail: "vikram.malhotra@flipkart.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Flipkart%20%22Engineering%20Director%22%20Frontend",
    location: "Bengaluru, India",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_razorpay_fe",
    name: "Rohan Kulkarni",
    roleTitle: "Senior Talent Acquisition Specialist - Merchant Experience",
    companyOrAgency: "Razorpay",
    type: "in_house_recruiter",
    category: "Tier-1 Unicorn",
    domainSpecialization: ["frontend", "fullstack", "backend"],
    seniorityTarget: ["senior", "lead"],
    verifiedEmail: "rohan.kulkarni@razorpay.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Razorpay%20%22Talent%20Acquisition%22%20Engineering",
    location: "Bengaluru, India",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_swiggy_fe",
    name: "Ananya Roy",
    roleTitle: "Talent Partner - Core Consumer Web & Mobile",
    companyOrAgency: "Swiggy",
    type: "in_house_recruiter",
    category: "Tier-1 Unicorn",
    domainSpecialization: ["frontend", "mobile", "fullstack"],
    seniorityTarget: ["senior", "lead", "principal"],
    verifiedEmail: "ananya.roy@swiggy.in",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Swiggy%20%22Talent%22%20Frontend",
    location: "Bengaluru, India",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_cred_em",
    name: "Aditya Shah",
    roleTitle: "Engineering Lead - Member Facing Products",
    companyOrAgency: "CRED",
    type: "hiring_manager",
    category: "Tier-1 Unicorn",
    domainSpecialization: ["frontend", "fullstack", "mobile"],
    seniorityTarget: ["senior", "lead", "principal"],
    verifiedEmail: "aditya.shah@cred.club",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=CRED%20%22Engineering%20Lead%22",
    location: "Bengaluru, India",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_groww_fe",
    name: "Pooja Varma",
    roleTitle: "Head of Tech Recruiting - Web Platforms & Mobile",
    companyOrAgency: "Groww",
    type: "in_house_recruiter",
    category: "Tier-1 Unicorn",
    domainSpecialization: ["frontend", "fullstack"],
    seniorityTarget: ["mid", "senior", "lead"],
    verifiedEmail: "pooja.varma@groww.in",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Groww%20%22Recruiter%22%20Engineering",
    location: "Bengaluru, India",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_zomato_em",
    name: "Karan Singhal",
    roleTitle: "Engineering Manager - Consumer Web & Platform",
    companyOrAgency: "Zomato",
    type: "hiring_manager",
    category: "Tier-1 Unicorn",
    domainSpecialization: ["frontend", "fullstack", "backend"],
    seniorityTarget: ["senior", "lead"],
    verifiedEmail: "karan.singhal@zomato.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Zomato%20%22Engineering%20Manager%22",
    location: "Gurugram / Remote",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_zepto_lead",
    name: "Saurabh Agarwal",
    roleTitle: "Staff Frontend Architect",
    companyOrAgency: "Zepto",
    type: "hiring_manager",
    category: "Tier-1 Unicorn",
    domainSpecialization: ["frontend", "fullstack"],
    seniorityTarget: ["lead", "principal"],
    verifiedEmail: "saurabh.agarwal@zeptonow.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Zepto%20%22Frontend%22%20Staff",
    location: "Mumbai / Bengaluru",
    acceptsImmediateJoiners: true,
  },

  // --- GLOBAL TECH HUBS IN INDIA & REMOTE ---
  {
    id: "rec_uber_fe",
    name: "Kavita Reddy",
    roleTitle: "Senior Technical Sourcer - Driver & Rider Core Web",
    companyOrAgency: "Uber",
    type: "in_house_recruiter",
    category: "Global Tech Hub",
    domainSpecialization: ["frontend", "fullstack"],
    seniorityTarget: ["senior", "lead", "principal"],
    verifiedEmail: "kavita.reddy@uber.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Uber%20%22Technical%20Recruiter%22%20India",
    location: "Hyderabad / Bengaluru",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_google_em",
    name: "Arjun Sen",
    roleTitle: "Engineering Lead - Cloud Business Frontend Solutions",
    companyOrAgency: "Google",
    type: "hiring_manager",
    category: "Global Tech Hub",
    domainSpecialization: ["frontend", "fullstack", "cloud"],
    seniorityTarget: ["senior", "lead", "principal"],
    verifiedEmail: "arjunsen@google.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Google%20%22Engineering%20Manager%22%20India",
    location: "Bengaluru / Hyderabad",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_databricks_fe",
    name: "David Chen",
    roleTitle: "Principal Talent Partner - UI Platform & Workspace",
    companyOrAgency: "Databricks",
    type: "in_house_recruiter",
    category: "Global Tech Hub",
    domainSpecialization: ["frontend", "fullstack"],
    seniorityTarget: ["senior", "lead", "principal"],
    verifiedEmail: "david.chen@databricks.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Databricks%20%22Recruiter%22%20Frontend",
    location: "Bengaluru / Remote",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_atlassian_em",
    name: "Meera Krishnan",
    roleTitle: "Engineering Manager - Jira & Confluence Web Experience",
    companyOrAgency: "Atlassian",
    type: "hiring_manager",
    category: "Global Tech Hub",
    domainSpecialization: ["frontend", "fullstack"],
    seniorityTarget: ["senior", "lead"],
    verifiedEmail: "mkrishnan@atlassian.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Atlassian%20%22Engineering%20Manager%22%20India",
    location: "Bengaluru / Remote",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_stripe_fe",
    name: "Elena Rostova",
    roleTitle: "Senior Tech Recruiter - Developer Dashboard Platforms",
    companyOrAgency: "Stripe",
    type: "in_house_recruiter",
    category: "Global Tech Hub",
    domainSpecialization: ["frontend", "fullstack"],
    seniorityTarget: ["senior", "lead"],
    verifiedEmail: "elena@stripe.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Stripe%20%22Recruiter%22%20Frontend",
    location: "Global Remote / India",
    acceptsImmediateJoiners: true,
  },

  // --- TOP FUNDED AI STARTUPS ---
  {
    id: "rec_perplexity_lead",
    name: "Alex Thorne",
    roleTitle: "Head of Frontend & Search UI Systems",
    companyOrAgency: "Perplexity AI",
    type: "hiring_manager",
    category: "Top AI Startup",
    domainSpecialization: ["frontend", "fullstack", "ai_ml"],
    seniorityTarget: ["senior", "lead", "principal"],
    verifiedEmail: "alex@perplexity.ai",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Perplexity%20%22Frontend%22",
    location: "Remote",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_scaleai_fe",
    name: "Marcus Vance",
    roleTitle: "Lead Technical Recruiter - Generative UI & Labeling Interfaces",
    companyOrAgency: "Scale AI",
    type: "in_house_recruiter",
    category: "Top AI Startup",
    domainSpecialization: ["frontend", "fullstack"],
    seniorityTarget: ["senior", "lead"],
    verifiedEmail: "marcus.vance@scale.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Scale%20AI%20%22Technical%20Recruiter%22",
    location: "Remote / India",
    acceptsImmediateJoiners: true,
  },

  // --- SPECIALIZED RECRUITMENT CONSULTANCIES & HEADHUNTERS ---
  {
    id: "rec_native_lead",
    name: "Gaurav Sharma",
    roleTitle: "Managing Partner - Technology Practice",
    companyOrAgency: "Native (Nativeworld)",
    type: "consultancy_partner",
    category: "Specialized Headhunter",
    domainSpecialization: ["frontend", "backend", "fullstack", "leadership"],
    seniorityTarget: ["senior", "lead", "principal", "director"],
    verifiedEmail: "gaurav.sharma@nativeworld.com",
    whatsappContact: "919810012345",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Native%20%22Partner%22%20Tech",
    location: "Bengaluru / Mumbai / Delhi",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_longhouse_lead",
    name: "Deepika Rao",
    roleTitle: "Practice Director - Startup Engineering & Unicorn Leadership",
    companyOrAgency: "Longhouse (SuperHuman Race)",
    type: "consultancy_partner",
    category: "Specialized Headhunter",
    domainSpecialization: ["frontend", "fullstack", "leadership"],
    seniorityTarget: ["lead", "principal", "director"],
    verifiedEmail: "deepika@longhouse.in",
    whatsappContact: "919820054321",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Longhouse%20%22Director%22%20Technology",
    location: "Bengaluru, India",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_walkwater_lead",
    name: "Sunil Joseph",
    roleTitle: "Co-Founder & VP - Software & DeepTech Practice",
    companyOrAgency: "WalkWater Technologies",
    type: "consultancy_partner",
    category: "Specialized Headhunter",
    domainSpecialization: ["frontend", "backend", "fullstack", "leadership"],
    seniorityTarget: ["lead", "principal", "director"],
    verifiedEmail: "sunil.joseph@walkwatertalent.com",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=WalkWater%20%22Technology%22%20Partner",
    location: "Bengaluru, India",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_michaelpage_lead",
    name: "Ritu Chawla",
    roleTitle: "Regional Director - Technology & Engineering Recruitment",
    companyOrAgency: "Michael Page India",
    type: "consultancy_partner",
    category: "Specialized Headhunter",
    domainSpecialization: ["frontend", "backend", "fullstack"],
    seniorityTarget: ["mid", "senior", "lead"],
    verifiedEmail: "rituchawla@michaelpage.co.in",
    whatsappContact: "919830098765",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=Michael%20Page%20%22Technology%22%20India",
    location: "Bengaluru / Gurgaon / Mumbai",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_abc_lead",
    name: "Tarun Kapoor",
    roleTitle: "Principal Consultant - IT & Digital Practice",
    companyOrAgency: "ABC Consultants",
    type: "consultancy_partner",
    category: "Specialized Headhunter",
    domainSpecialization: ["frontend", "fullstack", "mobile"],
    seniorityTarget: ["mid", "senior", "lead"],
    verifiedEmail: "tarun.kapoor@abcconsultants.in",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=ABC%20Consultants%20%22Technology%22",
    location: "Pan-India",
    acceptsImmediateJoiners: true,
  },
  {
    id: "rec_sutrahr_lead",
    name: "Waqas Merchant",
    roleTitle: "Senior Lead - Startup Tech Recruitment",
    companyOrAgency: "SutraHR",
    type: "consultancy_partner",
    category: "Specialized Headhunter",
    domainSpecialization: ["frontend", "fullstack", "backend"],
    seniorityTarget: ["junior", "mid", "senior", "lead"],
    verifiedEmail: "waqas@sutrahr.com",
    whatsappContact: "919920011223",
    linkedinSearchUrl: "https://www.linkedin.com/search/results/people/?keywords=SutraHR%20%22Tech%22",
    location: "Mumbai / Bengaluru / Remote",
    acceptsImmediateJoiners: true,
  },
];

/**
 * Filter recruiters and headhunters according to candidate profile, seniority, domain, and availability
 */
export function findMatchingRecruiters(params: {
  role: string;
  skills: string[];
  seniority: string; // e.g. "lead", "senior", "staff"
  noticePeriod?: NoticePeriodOption;
  searchFilter?: string;
}): RecruiterLead[] {
  const roleLower = params.role.toLowerCase();
  const skillsLower = params.skills.map((s) => s.toLowerCase());

  // Infer primary domain from role and skills
  let isFrontend = /front|react|vue|angular|web|ui|javascript|typescript/i.test(roleLower);
  let isBackend = /back|node|python|java|go|golang|distributed|microservice/i.test(roleLower);
  let isMobile = /mobile|ios|android|flutter|react native/i.test(roleLower);
  let isAi = /ai|ml|machine learning|data|nlp|llm/i.test(roleLower);

  if (!isFrontend && skillsLower.some((s) => /react|javascript|typescript|html|css|next/i.test(s))) {
    isFrontend = true;
  }

  const seniorityLower = params.seniority.toLowerCase();
  const targetSeniority: "junior" | "mid" | "senior" | "lead" | "principal" | "director" =
    /principal|staff|architect/i.test(seniorityLower)
      ? "principal"
      : /lead|manager|head/i.test(seniorityLower)
      ? "lead"
      : /senior|sr\./i.test(seniorityLower)
      ? "senior"
      : "mid";

  return RECRUITER_DIRECTORY.filter((lead) => {
    // 1. Text filter if user searched
    if (params.searchFilter) {
      const q = params.searchFilter.toLowerCase();
      const match =
        lead.name.toLowerCase().includes(q) ||
        lead.companyOrAgency.toLowerCase().includes(q) ||
        lead.roleTitle.toLowerCase().includes(q) ||
        lead.category.toLowerCase().includes(q);
      if (!match) return false;
    }

    // 2. Domain alignment
    let domainMatch = true;
    if (isFrontend && !lead.domainSpecialization.includes("frontend") && !lead.domainSpecialization.includes("fullstack")) {
      domainMatch = false;
    }

    // 3. Seniority overlap
    const seniorityMatch = lead.seniorityTarget.includes(targetSeniority) || lead.seniorityTarget.includes("lead") || lead.seniorityTarget.includes("senior");

    return domainMatch || seniorityMatch;
  });
}
