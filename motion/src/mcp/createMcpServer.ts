import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { detectFormat, extractResumeText } from "../services/resume/extractText.js";
import { reviewResume } from "../services/resume/pipeline.js";
import { parseResume } from "../services/resume/parse.js";
import { findMatchingJobs } from "../services/jobSearch.js";
import { generateJson } from "../services/ai.js";
import type { ResumeData } from "../services/resume/types.js";

/**
 * Creates and registers tools on an McpServer instance.
 * Can be connected to StdioServerTransport (for local CLI/Cursor)
 * or SSEServerTransport (for remote Claude/web clients).
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "motion-resume-job-agent",
    version: "1.0.0",
  });

  // ---------------------------------------------------------------------------
  // Tool 1: review_resume
  // ---------------------------------------------------------------------------
  server.tool(
    "review_resume",
    "Analyzes a local PDF or DOCX resume file against a target job role. Returns ATS readiness score (0-100), section checks, formatting issues, spelling errors, and recruiter improvement suggestions.",
    {
      filePath: z.string().describe("Absolute or relative path to the local resume file (.pdf or .docx)"),
      targetRole: z.string().describe("Target role the candidate is applying for (e.g. 'Senior Full Stack Engineer')"),
      jobDescription: z.string().optional().describe("Optional full job description to compare against for keyword matching"),
    },
    async ({ filePath, targetRole, jobDescription }) => {
      const fullPath = resolve(process.cwd(), filePath);
      if (!existsSync(fullPath)) {
        return {
          content: [{ type: "text", text: `Error: File not found at path: ${fullPath}` }],
          isError: true,
        };
      }

      const format = detectFormat(fullPath);
      if (!format) {
        return {
          content: [{ type: "text", text: "Error: Unsupported file format. Please provide a .pdf or .docx file." }],
          isError: true,
        };
      }

      try {
        const buffer = readFileSync(fullPath);
        const review = await reviewResume({
          buffer,
          format,
          targetRole,
          jobDescription,
        });

        const reportText = [
          `======================================================`,
          `📄 MOTION ATS RESUME REVIEW FOR: ${targetRole.toUpperCase()}`,
          `======================================================`,
          `ATS Readiness Score: ${review.report.score}/100`,
          `Candidate Name: ${review.original.contact.name || "Not detected"}`,
          `Candidate Location: ${review.original.contact.location || "Not detected"}`,
          ``,
          `--- ATS Checks Breakdown ---`,
          ...review.report.checks.map((c) => `[${c.pass ? "PASS" : "FAIL"}] ${c.label} (weight: ${c.weight}) - ${c.detail}`),
          ``,
          review.report.matchedKeywords.length > 0
            ? `Matched Keywords: ${review.report.matchedKeywords.join(", ")}`
            : "",
          review.report.missingKeywords.length > 0
            ? `Missing Critical Keywords: ${review.report.missingKeywords.slice(0, 10).join(", ")}`
            : "",
          ``,
          `--- Recruiter Suggestions ---`,
          ...review.suggestions.map((s, i) => `${i + 1}. ${s}`),
          ``,
          review.spelling.length > 0
            ? `Spelling Issues: ${review.spelling.map((s) => `${s.word} -> ${s.suggestion}`).join(", ")}`
            : "No spelling issues detected.",
          review.buzzwords.length > 0
            ? `Generic Buzzwords to remove: ${review.buzzwords.join(", ")}`
            : "No weak buzzwords detected.",
        ].filter(Boolean).join("\n");

        return {
          content: [{ type: "text", text: reportText }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to review resume: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Tool 2: improve_bullets
  // ---------------------------------------------------------------------------
  server.tool(
    "improve_bullets",
    "Rewrites weak or passive resume bullet points into high-impact, metric-driven ATS bullets using strong action verbs without hallucinating new facts.",
    {
      bullets: z.array(z.string()).describe("Array of weak or draft bullet points to optimize"),
      targetRole: z.string().describe("Target role title (e.g. 'Backend Developer')"),
      instructions: z.string().optional().describe("Optional custom guidance or additional factual metrics to emphasize"),
    },
    async ({ bullets, targetRole, instructions }) => {
      if (!bullets || bullets.length === 0) {
        return {
          content: [{ type: "text", text: "Error: Please provide at least one bullet point to improve." }],
          isError: true,
        };
      }

      const schema = {
        type: "object",
        properties: {
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["bullets"],
      };

      const systemPrompt =
        "You are Motion's expert ATS resume bullet optimizer.\n" +
        "1. Use ONLY facts provided. NEVER hallucinate false tools, numbers, or achievements.\n" +
        "2. Start every bullet with a strong action verb (e.g., Architected, Engineered, Streamlined, Spearheaded).\n" +
        "3. Remove filler words such as 'responsible for', 'worked on', 'helped with'.\n" +
        "4. Keep 1 line per bullet (8-25 words) with crisp technical phrasing.\n\n" +
        "FEW-SHOT EXAMPLES:\n" +
        "Input: 'Responsible for writing APIs in Node.js'\n" +
        "Output: {\"bullets\": [\"Architected and deployed high-throughput REST APIs using Node.js and Express.\"]}\n\n" +
        "Return JSON only: {\"bullets\": [\"...\"]}";

      const userPrompt =
        `Target Role: ${targetRole}\n` +
        (instructions ? `Instructions: ${instructions}\n` : "") +
        `Original Bullets:\n${bullets.map((b, i) => `${i + 1}. ${b}`).join("\n")}`;

      try {
        const result = await generateJson<{ bullets: string[] }>(systemPrompt, userPrompt, schema, { tier: "smart" });

        const outputText = [
          `✨ IMPROVED ATS BULLET POINTS (${targetRole}):`,
          `======================================================`,
          ...result.bullets.map((b, i) => `${i + 1}. ${b}`),
        ].join("\n");

        return {
          content: [{ type: "text", text: outputText }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to improve bullets: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Tool 3: find_matching_jobs
  // ---------------------------------------------------------------------------
  server.tool(
    "find_matching_jobs",
    "Searches and ranks live actively-hiring job listings matching a candidate's resume and target role across market boards (Adzuna, Remotive, Jobicy, Arbeitnow, LinkedIn/Indeed) and Gemini AI evaluation.",
    {
      filePath: z.string().optional().describe("Optional path to a local resume file (.pdf or .docx)"),
      resumeId: z.number().optional().describe("Optional ID of a saved resume in the Motion database"),
      targetRole: z.string().describe("Target role title (e.g. 'Full Stack Developer', 'Data Engineer')"),
      location: z.string().optional().default("India").describe("City or country (e.g. 'India', 'Bengaluru', 'Remote')"),
      remoteOnly: z.boolean().optional().default(false).describe("Filter for remote jobs only"),
      limit: z.number().optional().default(5).describe("Maximum number of jobs to return (default 5, max 10)"),
    },
    async ({ filePath, resumeId, targetRole, location, remoteOnly, limit }) => {
      let resumeData: ResumeData | null = null;

      try {
        if (resumeId) {
          const found = await prisma.resume.findUnique({ where: { id: resumeId } });
          if (found) {
            resumeData = (found.improved ?? found.original) as unknown as ResumeData;
          }
        }

        if (!resumeData && filePath) {
          const fullPath = resolve(process.cwd(), filePath);
          if (existsSync(fullPath)) {
            const format = detectFormat(fullPath);
            if (format) {
              const buffer = readFileSync(fullPath);
              const text = await extractResumeText(buffer, format);
              const parsed = await parseResume(text);
              resumeData = parsed.data;
            }
          }
        }

        if (!resumeData) {
          resumeData = {
            contact: { name: "Candidate", email: "", phone: "", location: location || "India", links: [] },
            summary: "",
            experience: [],
            education: [],
            projects: [],
            skills: [{ label: "General", items: [targetRole] }],
            certifications: [],
            achievements: [],
            other: [],
          };
        }

        const results = await findMatchingJobs({
          resumeData,
          targetRole,
          location,
          remoteOnly,
          limit: Math.min(limit || 5, 10),
        });

        const lines = [
          `======================================================`,
          `🎯 MATCHED ACTIVE JOBS FOR: ${targetRole.toUpperCase()}`,
          `Location: ${location || "India"} | Remote Only: ${remoteOnly ? "Yes" : "No"}`,
          `======================================================`,
          `Candidate Inferred Trajectory: ${results.profile.careerTrajectory}`,
          `Inferred Domains: ${results.profile.inferredDomains.join(", ")}`,
          `Seniority: ${results.profile.seniorityBand}`,
          ``,
          `Found ${results.jobs.length} top matching opportunities:`,
          ``,
        ];

        results.jobs.forEach((job) => {
          lines.push(`------------------------------------------------------`);
          lines.push(`[#${job.rank}] ${job.title} @ ${job.company} [${job.source || "Market"}]`);
          lines.push(`Location: ${job.location} | Salary: ${job.salary || "Not disclosed"}`);
          lines.push(`Match Score: ${Math.round((job.score / 10) * 100)}% (${job.score}/10)`);
          lines.push(`Recruiter Fit Reason: "${job.fitReason}"`);
          if (job.matchedSkills.length > 0) {
            lines.push(`Matched Skills: ${job.matchedSkills.join(", ")}`);
          }
          if (job.gaps.length > 0) {
            lines.push(`Gaps: ${job.gaps.join(", ")}`);
          }
          lines.push(`Apply Link: ${job.url}`);
        });

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to find matching jobs: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Tool 4: list_saved_resumes
  // ---------------------------------------------------------------------------
  server.tool(
    "list_saved_resumes",
    "Lists previously uploaded resumes from the Motion database with their IDs, file formats, target roles, and status.",
    {
      limit: z.number().optional().default(10).describe("Max count to return"),
    },
    async ({ limit }) => {
      try {
        const resumes = await prisma.resume.findMany({
          take: limit || 10,
          orderBy: { id: "desc" },
          select: {
            id: true,
            filename: true,
            targetRole: true,
            status: true,
            format: true,
            createdAt: true,
          },
        });

        if (resumes.length === 0) {
          return {
            content: [{ type: "text", text: "No resumes found in the database. Upload one via the web app or use review_resume with a local filePath." }],
          };
        }

        const lines = [
          `SAVED RESUMES IN MOTION DATABASE:`,
          `======================================================`,
          ...resumes.map(
            (r) => `[ID: ${r.id}] ${r.filename} | Target Role: ${r.targetRole} | Status: ${r.status} (${r.format.toUpperCase()})`
          ),
        ];

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to list resumes: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
