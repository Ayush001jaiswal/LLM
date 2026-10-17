import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import authRouter from "./routes/auth.js";
import conversationsRouter from "./routes/conversation.js";
import resumesRouter from "./routes/resumes.js";
import jobsRouter from "./routes/jobs.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { apiLimiter } from "./middleware/rateLimits.js";
import multer from "multer";
import documentsRouter from "./routes/documents.js";
import mcpRouter, { handleSseConnect, handlePostMessage } from "./routes/mcp.js";
import openapiRouter from "./routes/openapi.js";
import { failStaleResumeJobs } from "./services/resume/jobs.js"; 

const app = express();
const rawOrigins = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const allowedOrigins = rawOrigins.split(",").map((o) => o.trim().replace(/\/+$/, ""));

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, MCP, server-to-server)
      if (!origin) return callback(null, true);
      // Allow if explicit match or wildcard
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Allow Vercel preview deployments if vercel.app is permitted
      if (origin.endsWith(".vercel.app") || origin.includes("localhost")) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    exposedHeaders: ["X-Sources", "X-User-Message-Id"],
  })
);

app.use(express.json({ limit: "100kb" })); // rejects huge bodies
app.use("/api", apiLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/conversations/:id/documents", requireAuth, documentsRouter);
app.use("/api/conversations", requireAuth, conversationsRouter);
app.use("/api/resumes/:id/jobs", requireAuth, jobsRouter);
app.use("/api/resumes", requireAuth, resumesRouter);

// Remote MCP (SSE) - For Claude, Cursor, and remote AI agents
app.get("/sse", (req, res) => handleSseConnect(req, res, "/messages"));
app.post("/messages", handlePostMessage);
app.use("/api/mcp", mcpRouter);

// OpenAPI Specification & REST endpoints for ChatGPT Web Actions
app.use("/api", openapiRouter);


// Unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler: logs details on the server, sends a safe message to the client
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  const type = (err as { type?: string }).type;

  if (type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }
  if (type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }
  if (err instanceof multer.MulterError) {
    return res
      .status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({ error: err.code === "LIMIT_FILE_SIZE" ? "File too large (max 5 MB)" : "Upload failed" });
  }
  
  console.error(err);
  if (res.headersSent) return next(err); // mid-stream failure: let Express close the connection
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

failStaleResumeJobs().catch(console.error); 

const PORT = Number(process.env.PORT ?? 5000);
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
