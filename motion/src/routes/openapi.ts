import { Router } from "express";
import type { Request, Response } from "express";
import { generateJson } from "../services/ai.js";
import { findMatchingJobs } from "../services/jobSearch.js";
import { prisma } from "../db/prisma.js";

const router = Router();

// ---------------------------------------------------------------------------
// 1. OpenAPI 3.0 Specification Endpoint (for ChatGPT Custom GPT Actions)
// ---------------------------------------------------------------------------
router.get("/openapi.json", (req: Request, res: Response) => {
  const host = req.get("host") || "localhost:5000";
  const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const baseUrl = `${protocol}://${host}`;

  const spec = {
    openapi: "3.0.1",
    info: {
      title: "Motion Career & Job Search Agent API",
      description: "AI-powered resume optimization, metric-driven bullet improvement, and active job market matching.",
      version: "1.0.0",
    },
    servers: [
      {
        url: baseUrl,
        description: "Motion Cloud Backend",
      },
    ],
    paths: {
      "/api/mcp/improve_bullets": {
        post: {
          operationId: "improveBullets",
          summary: "Rewrites draft or weak resume bullet points into high-impact ATS bullets with metrics and action verbs.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["bullets", "targetRole"],
                  properties: {
                    bullets: {
                      type: "array",
                      items: { type: "string" },
                      description: "List of bullet points to optimize.",
                      example: ["worked on react frontend", "helped team with bugs"],
                    },
                    targetRole: {
                      type: "string",
                      description: "Target job title (e.g. 'Senior Full Stack Engineer').",
                      example: "Senior Full Stack Engineer",
                    },
                    instructions: {
                      type: "string",
                      description: "Optional custom guidance or metrics to include.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Optimized bullet points.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      bullets: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/mcp/find_matching_jobs": {
        post: {
          operationId: "findMatchingJobs",
          summary: "Searches active live hiring opportunities and evaluates fit using AI scoring.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["targetRole"],
                  properties: {
                    targetRole: {
                      type: "string",
                      description: "Job title to search for (e.g. 'React Developer').",
                      example: "React Developer",
                    },
                    location: {
                      type: "string",
                      description: "Location/country (e.g. 'India', 'Bengaluru', 'Remote').",
                      default: "India",
                    },
                    remoteOnly: {
                      type: "boolean",
                      description: "Filter for remote jobs only.",
                      default: false,
                    },
                    limit: {
                      type: "integer",
                      description: "Max results to return (default 5, max 10).",
                      default: 5,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "List of matched live jobs.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      jobs: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            company: { type: "string" },
                            location: { type: "string" },
                            salary: { type: "string" },
                            score: { type: "number" },
                            fitReason: { type: "string" },
                            url: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/mcp/list_saved_resumes": {
        get: {
          operationId: "listSavedResumes",
          summary: "Lists uploaded resumes from the Motion database.",
          responses: {
            "200": {
              description: "List of resumes.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      resumes: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "integer" },
                            filename: { type: "string" },
                            targetRole: { type: "string" },
                            status: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  res.json(spec);
});

// ---------------------------------------------------------------------------
// 2. Direct REST Endpoints (Called by ChatGPT Actions or HTTP clients)
// ---------------------------------------------------------------------------

// POST /api/mcp/improve_bullets
router.post("/mcp/improve_bullets", async (req: Request, res: Response) => {
  const { bullets, targetRole, instructions } = req.body;

  if (!bullets || !Array.isArray(bullets) || bullets.length === 0 || !targetRole) {
    return res.status(400).json({ error: "Missing required fields: bullets (array) and targetRole (string)" });
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
    "2. Start every bullet with a strong action verb.\n" +
    "3. Remove filler words such as 'responsible for', 'worked on', 'helped with'.\n" +
    "4. Keep 1 line per bullet (8-25 words) with crisp technical phrasing.\n\n" +
    "Return JSON only: {\"bullets\": [\"...\"]}";

  const userPrompt =
    `Target Role: ${targetRole}\n` +
    (instructions ? `Instructions: ${instructions}\n` : "") +
    `Original Bullets:\n${bullets.map((b: string, i: number) => `${i + 1}. ${b}`).join("\n")}`;

  try {
    const result = await generateJson<{ bullets: string[] }>(systemPrompt, userPrompt, schema, { tier: "smart" });
    return res.json(result);
  } catch (err) {
    console.error("Error in /api/mcp/improve_bullets:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/mcp/find_matching_jobs
router.post("/mcp/find_matching_jobs", async (req: Request, res: Response) => {
  const { targetRole, location = "India", remoteOnly = false, limit = 5 } = req.body;

  if (!targetRole) {
    return res.status(400).json({ error: "Missing targetRole parameter" });
  }

  const minimalProfile = {
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

  try {
    const results = await findMatchingJobs({
      resumeData: minimalProfile,
      targetRole,
      location,
      remoteOnly: Boolean(remoteOnly),
      limit: Math.min(Number(limit) || 5, 10),
    });

    return res.json({
      targetRole,
      location,
      count: results.jobs.length,
      jobs: results.jobs.map((j) => ({
        title: j.title,
        company: j.company,
        location: j.location,
        salary: j.salary,
        score: j.score,
        fitReason: j.fitReason,
        matchedSkills: j.matchedSkills,
        gaps: j.gaps,
        url: j.url,
      })),
    });
  } catch (err) {
    console.error("Error in /api/mcp/find_matching_jobs:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/mcp/list_saved_resumes
router.get("/mcp/list_saved_resumes", async (_req: Request, res: Response) => {
  try {
    const resumes = await prisma.resume.findMany({
      take: 10,
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
    return res.json({ resumes });
  } catch (err) {
    console.error("Error in /api/mcp/list_saved_resumes:", err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
