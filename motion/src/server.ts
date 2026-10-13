// import "dotenv/config";
// import express from "express";
// import cors from "cors";
// import authRouter from "./routes/auth.js";
// import conversationsRouter from "./routes/conversation.js";
// import { requireAuth } from "./middleware/requireAuth.js";

// const app = express();
// app.use(cors({ origin: "http://localhost:5173" })); // only your frontend may call the API
// app.use(express.json());

// app.get("/api/health", (_req, res) => {
//   res.json({ status: "ok" });
// });

// app.use("/api/auth", authRouter);
// app.use("/api/conversations", requireAuth, conversationsRouter);

// const PORT = Number(process.env.PORT ?? 5000);
// app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import authRouter from "./routes/auth.js";
import conversationsRouter from "./routes/conversation.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { apiLimiter } from "./middleware/rateLimits.js";

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: "100kb" })); // rejects huge bodies
app.use("/api", apiLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/conversations", requireAuth, conversationsRouter);

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

  console.error(err);
  if (res.headersSent) return next(err); // mid-stream failure: let Express close the connection
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const PORT = Number(process.env.PORT ?? 5000);
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));