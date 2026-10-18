# Motion: Autonomous AI Career & Recruitment Platform

[![CI/CD Pipeline](https://github.com/Ayush001jaiswal/LLM/actions/workflows/ci.yml/badge.svg)](https://github.com/Ayush001jaiswal/LLM/actions/workflows/ci.yml)
[![Live Frontend](https://img.shields.io/badge/Vercel-Live%20App-black?logo=vercel)](https://llm-fawn.vercel.app/)
[![Live Backend](https://img.shields.io/badge/Render-Live%20API-46E3B7?logo=render)](https://motion-backend-d1d9.onrender.com/api/health)
[![Database](https://img.shields.io/badge/Neon-PostgreSQL-00E599?logo=postgresql)](https://neon.tech)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Standard%20v1.0-blue)](https://modelcontextprotocol.io)

An autonomous full-stack AI platform designed to evaluate candidate resumes with strict ATS rubrics, match candidates to active hiring markets with LLM-as-a-judge scoring, and provide remote agent integrations across Claude, Cursor, and ChatGPT.

---

## 🌐 Live Production Deployments

* **Web Application (Vercel)**: [https://llm-fawn.vercel.app/](https://llm-fawn.vercel.app/)
* **Cloud API & Health Check (Render)**: [https://motion-backend-d1d9.onrender.com/api/health](https://motion-backend-d1d9.onrender.com/api/health)
* **Remote MCP Server (SSE)**: `https://motion-backend-d1d9.onrender.com/sse`
* **ChatGPT Custom GPT Action Schema**: `https://motion-backend-d1d9.onrender.com/api/openapi.json`

---

## 🏗️ Monorepo Architecture

```
.
├── .github/workflows/
│   └── ci.yml               # Automated CI/CD Pipeline (Build, Typecheck, Smoke Tests)
├── motion/                  # Backend Express API & MCP Server
│   ├── src/
│   │   ├── mcp/             # MCP Server (Stdio & SSE Transports)
│   │   ├── routes/          # Express Routers (Auth, Jobs, Resumes, MCP, OpenAPI)
│   │   ├── services/        # AI Router (Gemini Flash), Adzuna Jobs, ATS Engine
│   │   └── server.ts        # Main Express Application
│   ├── prisma/              # Prisma Schema & Neon Cloud Database Configuration
│   └── package.json
└── motion_ui/               # Frontend React 19 + Vite SPA
    ├── src/                 # Interactive Dashboard, Job Matcher & Resume Panels
    └── package.json
```

---

## 🤖 Model Context Protocol (MCP) Integration

Motion exposes 4 tools for any MCP client (Cursor, Claude Desktop, Antigravity):

1. `improve_bullets`: Rewrites weak resume bullet points into metric-driven action bullets.
2. `find_matching_jobs`: Scrapes and ranks live jobs from active hiring markets using Gemini evaluation.
3. `review_resume`: Complete ATS readiness audit (0–100) with keyword gap analysis.
4. `list_saved_resumes`: Retrieves saved resumes from the cloud database.

### Connect Cursor or Claude Desktop:
```json
{
  "mcpServers": {
    "motion-cloud": {
      "url": "https://motion-backend-d1d9.onrender.com/sse"
    }
  }
}
```

---

## 🚀 CI/CD Pipeline

Every push to `main` and Pull Request automatically triggers:
1. **Backend CI**: Generates Prisma client, compiles TypeScript, and validates all route types.
2. **Frontend CI**: Checks linting and bundles production Vite assets.
3. **Production Smoke Test**: Pings live Render and Vercel endpoints to ensure zero downtime.
