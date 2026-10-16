import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { streamChat, generateTitle } from "../services/ai.js";
import type { Role } from "../services/llm.js";
import type { Response } from "express";
import { modelLimiter } from "../middleware/rateLimits.js";
import { parseBody, chatSchema, createConversationSchema, renameSchema  } from "../validation.js";
import { retrieveContext } from "../services/rag.js";
import type { Source } from "../services/rag.js";

const router = Router();

function parseId(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Loads recent history, streams the model's reply to the client, then saves it

// async function streamReply(conversationId: number, res: Response): Promise<void> {
//   const recent = await prisma.message.findMany({
//     where: { conversationId },
//     orderBy: { id: "desc" },
//     take: 8,
//   });
//   const history = recent.reverse().map((m) => ({
//     role: m.role as Role,
//     content: m.content,
//   }));

//   const controller = new AbortController();
//   res.on("close", () => controller.abort());

//   let context: string | undefined;
//   let sources: Source[] | undefined;
//   const lastUser = [...history].reverse().find((m) => m.role === "user");
//   if (lastUser) {
//     try {
//       const found = await retrieveContext(conversationId, lastUser.content, controller.signal);
//       if (found) {
//         context = found.context;
//         sources = found.sources;
//       }
//     } catch (err) {
//       if ((err as Error).name !== "AbortError") console.error("Retrieval failed", err);
//     }
//   }

//   let reply = "";
//   let failure: Error | null = null;

//   try {
//     res.setHeader("Content-Type", "text/plain; charset=utf-8");
//     if (sources?.length) {
//       // Base64 keeps non-English text safe inside an HTTP header
//       res.setHeader("X-Sources", Buffer.from(JSON.stringify(sources)).toString("base64"));
//     }
//     for await (const text of streamChat(history, controller.signal, context)) {
//       reply += text;
//       res.write(text);
//     }
//   } catch (err) {
//     if ((err as Error).name !== "AbortError") failure = err as Error;
//   }

//   if (reply.trim()) {
//     await prisma.message.create({
//       data: { conversationId, role: "assistant", content: reply, sources },
//     });
//     await prisma.conversation.update({
//       where: { id: conversationId },
//       data: { updatedAt: new Date() },
//     });
//   }

//   if (failure) {
//     console.error(failure);
//     if (!res.headersSent) res.status(500).json({ error: failure.message });
//     else res.end();
//     return;
//   }
//   res.end();
// }

// What the model reads for a user message. A quoted reply gets a short explanation added.
function toModelContent(m: { role: string; content: string; quote: string | null }): string {
  if (m.role === "user" && m.quote) {
    return (
      `The user is replying to this part of your previous answer:\n"""\n${m.quote}\n"""\n\n` +
      `Their message: ${m.content}`
    );
  }
  return m.content;
}

// async function streamReply(
//   conversationId: number,
//   res: Response,
//   opts: { upToMessageId?: number; replaceMessageId?: number } = {}
// ): Promise<void> {
//   // History: the last 8 messages, but only up to the edited prompt when editing
//   const recent = await prisma.message.findMany({
//     where: {
//       conversationId,
//       ...(opts.upToMessageId ? { id: { lte: opts.upToMessageId } } : {}),
//     },
//     orderBy: { id: "desc" },
//     take: 8,
//   });
//   const history = recent.reverse().map((m) => ({
//     role: m.role as Role,
//     content: m.content,
//   }));

//   const controller = new AbortController();
//   res.on("close", () => controller.abort());

//   let context: string | undefined;
//   let sources: Source[] | undefined;
//   const lastUser = [...history].reverse().find((m) => m.role === "user");
//   if (lastUser) {
//     try {
//       const found = await retrieveContext(conversationId, lastUser.content, controller.signal);
//       if (found) {
//         context = found.context;
//         sources = found.sources;
//       }
//     } catch (err) {
//       if ((err as Error).name !== "AbortError") console.error("Retrieval failed", err);
//     }
//   }

//   let reply = "";
//   let failure: Error | null = null;

//   try {
//     res.setHeader("Content-Type", "text/plain; charset=utf-8");
//     if (sources?.length) {
//       res.setHeader("X-Sources", Buffer.from(JSON.stringify(sources)).toString("base64"));
//     }
//     for await (const text of streamChat(history, controller.signal, context)) {
//       reply += text;
//       res.write(text);
//     }
//   } catch (err) {
//     if ((err as Error).name !== "AbortError") failure = err as Error;
//   }

//   if (reply.trim()) {
//     // An empty list clears old sources when a reply is overwritten
//     const sourcesValue = JSON.parse(JSON.stringify(sources ?? []));

//     if (opts.replaceMessageId) {
//       // Overwrite the existing reply so it keeps its position in the chat
//       await prisma.message.update({
//         where: { id: opts.replaceMessageId },
//         data: { content: reply, sources: sourcesValue },
//       });
//     } else {
//       await prisma.message.create({
//         data: { conversationId, role: "assistant", content: reply, sources: sourcesValue },
//       });
//     }
//     await prisma.conversation.update({
//       where: { id: conversationId },
//       data: { updatedAt: new Date() },
//     });
//   }

//   if (failure) {
//     console.error(failure);
//     if (!res.headersSent) res.status(500).json({ error: failure.message });
//     else res.end();
//     return;
//   }
//   res.end();
// }

// GET /api/conversations: list chats for the sidebar

async function streamReply(
  conversationId: number,
  res: Response,
  opts: { upToMessageId?: number; replaceMessageId?: number } = {}
): Promise<void> {
  const recent = await prisma.message.findMany({
    where: {
      conversationId,
      ...(opts.upToMessageId ? { id: { lte: opts.upToMessageId } } : {}),
    },
    orderBy: { id: "desc" },
    take: 8,
  });
  const rows = recent.reverse();
  const history = rows.map((m) => ({
    role: m.role as Role,
    content: toModelContent(m),
  }));

  const controller = new AbortController();
  res.on("close", () => controller.abort());

  // Search the documents using the question, plus the start of the quoted text if there is one
  let context: string | undefined;
  let sources: Source[] | undefined;
  const lastUser = [...rows].reverse().find((m) => m.role === "user");
  if (lastUser) {
    const query = lastUser.quote
      ? `${lastUser.quote.slice(0, 300)}\n${lastUser.content}`
      : lastUser.content;
    try {
      const found = await retrieveContext(conversationId, query, controller.signal);
      if (found) {
        context = found.context;
        sources = found.sources;
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.error("Retrieval failed", err);
    }
  }

  let reply = "";
  let failure: Error | null = null;

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    if (sources?.length) {
      res.setHeader("X-Sources", Buffer.from(JSON.stringify(sources)).toString("base64"));
    }
    for await (const text of streamChat(history, controller.signal, context)) {
      reply += text;
      res.write(text);
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") failure = err as Error;
  }

  if (reply.trim()) {
    const sourcesValue = JSON.parse(JSON.stringify(sources ?? []));

    if (opts.replaceMessageId) {
      await prisma.message.update({
        where: { id: opts.replaceMessageId },
        data: { content: reply, sources: sourcesValue },
      });
    } else {
      await prisma.message.create({
        data: { conversationId, role: "assistant", content: reply, sources: sourcesValue },
      });
    }
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
    select: { id: true, role: true, content: true, quote: true, sources: true, createdAt: true },
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
router.post("/:id/chat", modelLimiter, async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) return res.status(400).json({ error: "Invalid conversation id" });
  
  const data = parseBody(chatSchema, req.body, res);
  if (!data) return;

  const content = data.content;

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const saved = await prisma.message.create({
    data: { conversationId: id, role: "user", content, quote: data.quote || null },
    select: { id: true },
  });

  res.setHeader("X-User-Message-Id", String(saved.id));

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

// PATCH /api/conversations/:id: rename a chat
router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid conversation id" });

  const data = parseBody(renameSchema, req.body, res);
  if (!data) return;

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const updated = await prisma.conversation.update({
    where: { id },
    // Keep the old updatedAt so renaming doesn't move the chat to the top
    data: { title: data.title, updatedAt: conversation.updatedAt },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  res.json(updated);
});

// POST /api/conversations/:id/messages/:messageId/edit
// Changes a user message, deletes everything after it, and streams a new reply
router.post("/:id/messages/:messageId/edit", modelLimiter, async (req, res) => {
  const id = parseId(req.params.id as string);
  const messageId = parseId(req.params.messageId as string);
  if (!id || !messageId) return res.status(400).json({ error: "Invalid id" });

  const data = parseBody(chatSchema, req.body, res);
  if (!data) return;

  const userId = res.locals.userId as number;
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversationId: id, role: "user" },
  });
  if (!message) return res.status(404).json({ error: "Message not found" });

  await prisma.$transaction([
    prisma.message.deleteMany({ where: { conversationId: id, id: { gt: messageId } } }),
    prisma.message.update({ where: { id: messageId }, data: { content: data.content } }),
  ]);

  await streamReply(id, res, { upToMessageId: messageId });
});

export default router;