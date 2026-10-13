// import express, { Request, Response } from "express";
// import cors from "cors";
// import { streamChat, ChatMessage } from "./services/llm.js";
// import conversationsRouter from "./routes/conversation.js";

// const app = express();
// app.use(cors());
// app.use(express.json());
// app.use("/api/conversations", conversationsRouter);

// app.get("/api/health", (_req: Request, res: Response) => {
//   res.json({ status: "ok" });
// });

// app.post("/api/chat", async (req: Request, res: Response) => {
//   const messages = req.body?.messages as ChatMessage[] | undefined;

//   if (!Array.isArray(messages) || messages.length === 0) {
//     return res.status(400).json({ error: "messages array is required" });
//   }

//   // Cancel generation if the user clicks Stop or closes the tab
//   const controller = new AbortController();
//   res.on("close", () => controller.abort());

//   try {
//     res.setHeader("Content-Type", "text/plain; charset=utf-8");
//     for await (const text of streamChat(messages, controller.signal)) {
//       res.write(text);
//     }
//     res.end();
//   } catch (err) {
//     if ((err as Error).name === "AbortError") return;
//     console.error(err);
//     if (!res.headersSent) res.status(500).json({ error: "Server error" });
//     else res.end();
//   }
// });

// const PORT = Number(process.env.PORT ?? 5000);
// app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.js";
import conversationsRouter from "./routes/conversation.js";
import { requireAuth } from "./middleware/requireAuth.js";

const app = express();
app.use(cors({ origin: "http://localhost:5173" })); // only your frontend may call the API
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/conversations", requireAuth, conversationsRouter);

const PORT = Number(process.env.PORT ?? 5000);
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));