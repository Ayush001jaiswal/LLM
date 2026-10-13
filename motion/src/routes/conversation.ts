import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { streamChat, generateTitle, Role } from "../services/llm.js";
import type { Response } from "express";
import { modelLimiter } from "../middleware/rateLimits.js";
import { parseBody, chatSchema, createConversationSchema } from "../validation.js";

const router = Router();

function parseId(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Loads recent history, streams the model's reply to the client, then saves it
async function streamReply(conversationId: number, res: Response): Promise<void> {
  const recent = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { id: "desc" },
    take: 8,
  });
  const history = recent.reverse().map((m) => ({
    role: m.role as Role,
    content: m.content,
  }));

  // Stop generating if the user clicks Stop or closes the tab
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  let reply = "";
  let failure: Error | null = null;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    for await (const text of streamChat(history, controller.signal)) {
      reply += text;
      res.write(text);
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") failure = err as Error;
  }

  // Save the reply (also saves partial text if the user hit Stop)
  if (reply.trim()) {
    await prisma.message.create({
      data: { conversationId, role: "assistant", content: reply },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  if (failure) {
    console.error(failure);
    if (!res.headersSent) res.status(500).json({ error: failure.message });
    else res.end();
    return;
  }
  res.end();
}

// GET /api/conversations: list chats for the sidebar
router.get("/", async (_req, res) => {
  const userId = res.locals.userId as number;
  const conversations = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  res.json(conversations);
});

// POST /api/conversations: create a new chat
// router.post("/", async (req, res) => {
//   const userId = res.locals.userId as number;
//   const title =
//     typeof req.body?.title === "string" && req.body.title.trim()
//       ? req.body.title.trim().slice(0, 100)
//       : undefined; // undefined uses the default "New chat"

//   const conversation = await prisma.conversation.create({
//     data: { userId, title },
//     select: { id: true, title: true, createdAt: true },
//   });
//   res.status(201).json(conversation);
// });
router.post("/", async (req, res) => {
  const data = parseBody(createConversationSchema, req.body, res);
  if (!data) return;

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.create({
    data: { userId, title: data.title }, // undefined uses the default "New chat"
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  res.status(201).json(conversation);
});

// GET /api/conversations/:id/messages: load an old chat
router.get("/:id/messages", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid conversation id" });

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId },
  });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { id: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });
  res.json({ conversation, messages });
});

// DELETE /api/conversations/:id: delete a chat (messages cascade)
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid conversation id" });

  const userId = res.locals.userId as number;
  const result = await prisma.conversation.deleteMany({ where: { id, userId } });
  if (result.count === 0) return res.status(404).json({ error: "Conversation not found" });

  res.status(204).end();
});

// POST /api/conversations/:id/chat: save user message, stream reply, save reply
// router.post("/:id/chat", async (req, res) => {
//   const id = parseId(req.params.id);
//   if (!id) return res.status(400).json({ error: "Invalid conversation id" });

//   const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
//   if (!content) return res.status(400).json({ error: "content is required" });
//   if (content.length > 4000) return res.status(400).json({ error: "Message too long" });

//   const userId = res.locals.userId as number;
//   const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
//   if (!conversation) return res.status(404).json({ error: "Conversation not found" });

//   // 1. Save the user's message
//   await prisma.message.create({
//     data: { conversationId: id, role: "user", content },
//   });

//   // Simple auto-title from the first message
//   if (conversation.title === "New chat") {
//     await prisma.conversation.update({
//       where: { id },
//       data: { title: content.slice(0, 40) },
//     });
//   }

//   // 2. Load the last 8 messages from the database as context
//   const recent = await prisma.message.findMany({
//     where: { conversationId: id },
//     orderBy: { id: "desc" },
//     take: 8,
//   });
//   const history = recent.reverse().map((m) => ({
//     role: m.role as Role,
//     content: m.content,
//   }));

//   // Stop generating if the user clicks Stop or closes the tab
//   const controller = new AbortController();
//   res.on("close", () => controller.abort());

//   // 3. Stream the reply while collecting it
//   let reply = "";
//   let failure: Error | null = null;

//   try {
//     res.setHeader("Content-Type", "text/plain; charset=utf-8");
//     for await (const text of streamChat(history, controller.signal)) {
//       reply += text;
//       res.write(text);
//     }
//   } catch (err) {
//     if ((err as Error).name !== "AbortError") failure = err as Error;
//   }

//   // 4. Save the assistant reply (also saves the partial text if the user hit Stop)
//   if (reply.trim()) {
//     await prisma.message.create({
//       data: { conversationId: id, role: "assistant", content: reply },
//     });
//     await prisma.conversation.update({
//         where: { id },
//         data: { updatedAt: new Date() },
//     });
//   }

//   if (failure) {
//     console.error(failure);
//     if (!res.headersSent) res.status(500).json({ error: failure.message });
//     else res.end();
//     return;
//   }
//   res.end();
// });
// POST /api/conversations/:id/chat: save user message, stream reply, save reply
router.post("/:id/chat", modelLimiter, async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) return res.status(400).json({ error: "Invalid conversation id" });
  
  const data = parseBody(chatSchema, req.body, res);
  if (!data) return;

  //const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  const content = data.content;
//   if (!content) return res.status(400).json({ error: "content is required" });
//   if (content.length > 4000) return res.status(400).json({ error: "Message too long" });

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  await prisma.message.create({
    data: { conversationId: id, role: "user", content },
  });

  // Temporary title from the first message (the model replaces it later)
  if (conversation.title === "New chat") {
    await prisma.conversation.update({
      where: { id },
      data: { title: content.slice(0, 40) },
    });
  }

  await streamReply(id, res);
});
// POST /api/conversations/:id/title: replace the temporary title with a model-written one
router.post("/:id/title", modelLimiter, async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) return res.status(400).json({ error: "Invalid conversation id" });

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const [firstUser, firstReply] = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { id: "asc" },
    take: 2,
  });

  // Needs one question and one answer, and the title must still be the temporary one.
  // That second check stops repeated calls from wasting CPU.
  if (
    !firstUser || firstUser.role !== "user" ||
    !firstReply || firstReply.role !== "assistant" ||
    conversation.title !== firstUser.content.slice(0, 40)
  ) {
    return res.json({ title: conversation.title });
  }

  try {
    const title = await generateTitle(firstUser.content, firstReply.content);
    if (!title) return res.json({ title: conversation.title });

    await prisma.conversation.update({ where: { id }, data: { title } });
    res.json({ title });
  } catch (err) {
    console.error("Title generation failed", err);
    res.json({ title: conversation.title });
  }
});

// POST /api/conversations/:id/regenerate: replace the last reply with a new one
router.post("/:id/regenerate", modelLimiter, async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) return res.status(400).json({ error: "Invalid conversation id" });

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const last = await prisma.message.findFirst({
    where: { conversationId: id },
    orderBy: { id: "desc" },
  });
  if (!last) return res.status(400).json({ error: "Nothing to regenerate" });

  // Remove the old reply. If the last message is a user message (the previous
  // attempt failed or was stopped early), there is nothing to remove.
  if (last.role === "assistant") {
    await prisma.message.delete({ where: { id: last.id } });
  }

  await streamReply(id, res);
});

export default router;