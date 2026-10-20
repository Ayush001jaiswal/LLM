import fs from "fs";

let code = fs.readFileSync("motion_ui/src/api.resume.ts", "utf8");

const addition = `
export interface EmailPatternGuess {
  pattern: string;
  exampleEmail: string;
  confidence: string;
  corporateDomain: string;
}

export interface JobApplicationItem {
  id: number;
  userId: number;
  resumeId?: number | null;
  company: string;
  role: string;
  location?: string | null;
  salary?: string | null;
  jobUrl?: string | null;
  status: "bookmarked" | "connected" | "follow_up_due" | "interview" | "offer" | "rejected";
  leadName?: string | null;
  leadTitle?: string | null;
  leadEmail?: string | null;
  leadLinkedin?: string | null;
  outreachNotes?: string | null;
  appliedAt?: string | null;
  nextFollowUpAt?: string | null;
  lastContactedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchApplications(): Promise<JobApplicationItem[]> {
  const { API, authHeaders, ensureOk } = await import("./api");
  const res = await fetch(\`\${API}/applications\`, { headers: authHeaders() });
  await ensureOk(res);
  return res.json();
}

export async function saveApplication(data: Partial<JobApplicationItem> & { company: string; role: string; nextFollowUpDays?: number }): Promise<JobApplicationItem> {
  const { API, authHeaders, ensureOk } = await import("./api");
  const res = await fetch(\`\${API}/applications\`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  await ensureOk(res);
  return res.json();
}

export async function updateApplication(id: number, data: Partial<JobApplicationItem>): Promise<JobApplicationItem> {
  const { API, authHeaders, ensureOk } = await import("./api");
  const res = await fetch(\`\${API}/applications/\${id}\`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  await ensureOk(res);
  return res.json();
}

export async function deleteApplication(id: number): Promise<void> {
  const { API, authHeaders, ensureOk } = await import("./api");
  const res = await fetch(\`\${API}/applications/\${id}\`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await ensureOk(res);
}
`;

code = code.replace(
  `export interface GeneratedPitches {
  recruiterConnectionNote: string;
  recruiterInMail: string;
  alumniWarmReferralNote: string;
  consultancyIntroBrief: string;
}`,
  `export interface GeneratedPitches {
  recruiterConnectionNote: string;
  recruiterInMail: string;
  alumniWarmReferralNote: string;
  consultancyIntroBrief: string;
  followUpDay4?: string;
  followUpDay8?: string;
}`
);

code = code.replace(
  `export interface NetworkMatchingResult {
  targetCompany: string;
  targetRole: string;
  candidateSeniority: string;
  candidateTopSkills: string[];
  mutualMatches: RecruiterTarget[];
  networkBridges: AlumniNetworkBridge[];
  consultancies: ConsultancyMatch[];
  pitches: GeneratedPitches;
}`,
  `export interface NetworkMatchingResult {
  targetCompany: string;
  targetRole: string;
  candidateSeniority: string;
  candidateTopSkills: string[];
  emailPatterns?: EmailPatternGuess[];
  mutualMatches: RecruiterTarget[];
  networkBridges: AlumniNetworkBridge[];
  consultancies: ConsultancyMatch[];
  pitches: GeneratedPitches;
}`
);

code += addition;

fs.writeFileSync("motion_ui/src/api.resume.ts", code, "utf8");
console.log("Updated api.resume.ts with Application CRM & Email Pattern types");
