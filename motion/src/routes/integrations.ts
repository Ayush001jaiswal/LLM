import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { testMcpConnection } from "../services/mcp/clientManager.js";
import { z } from "zod";

const router = Router();

const createServerSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  serverType: z.enum(["slack", "gmail", "github", "custom"]).default("custom"),
  url: z.string().url("Valid HTTP(S) URL is required"),
  headers: z.record(z.string(), z.string()).optional(),
});

const updateServerSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});

/**
 * GET /api/integrations
 * List all MCP servers configured for this user.
 */
router.get("/", async (_req: Request, res: Response) => {
  const userId = res.locals.userId as number;
  try {
    const servers = await prisma.mcpServerConnection.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/integrations
 * Register a new remote MCP server and test it.
 */
router.post("/", async (req: Request, res: Response) => {
  const userId = res.locals.userId as number;
  const parsed = createServerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }

  const { name, serverType, url, headers } = parsed.data;

  // Test the connection immediately
  const testRes = await testMcpConnection(url, headers);

  try {
    const server = await prisma.mcpServerConnection.create({
      data: {
        userId,
        name,
        serverType,
        url,
        headers: headers ? (headers as any) : {},
        enabled: true,
        tools: testRes.tools as any,
        status: testRes.error ? "error" : "connected",
        error: testRes.error ?? null,
        lastTestedAt: new Date(),
      },
    });

    res.status(201).json(server);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/integrations/:id/test
 * Re-test connection and refresh discovered tools.
 */
router.post("/:id/test", async (req: Request, res: Response) => {
  const userId = res.locals.userId as number;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid server ID" });
    return;
  }

  try {
    const server = await prisma.mcpServerConnection.findFirst({
      where: { id, userId },
    });
    if (!server) {
      res.status(404).json({ error: "Server connection not found" });
      return;
    }

    const headers = (server.headers as Record<string, string> | null) ?? undefined;
    const testRes = await testMcpConnection(server.url, headers);

    const updated = await prisma.mcpServerConnection.update({
      where: { id },
      data: {
        status: testRes.error ? "error" : "connected",
        error: testRes.error ?? null,
        tools: testRes.tools as any,
        lastTestedAt: new Date(),
      },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * PATCH /api/integrations/:id
 * Update server settings (e.g. toggle enabled).
 */
router.patch("/:id", async (req: Request, res: Response) => {
  const userId = res.locals.userId as number;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid server ID" });
    return;
  }

  const parsed = updateServerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }

  try {
    const existing = await prisma.mcpServerConnection.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Server connection not found" });
      return;
    }

    const updated = await prisma.mcpServerConnection.update({
      where: { id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.url ? { url: parsed.data.url } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        ...(parsed.data.headers ? { headers: parsed.data.headers as any } : {}),
      },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * DELETE /api/integrations/:id
 * Remove an MCP server connection.
 */
router.delete("/:id", async (req: Request, res: Response) => {
  const userId = res.locals.userId as number;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid server ID" });
    return;
  }

  try {
    const deleted = await prisma.mcpServerConnection.deleteMany({
      where: { id, userId },
    });
    if (deleted.count === 0) {
      res.status(404).json({ error: "Server connection not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
