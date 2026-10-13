import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { hashPassword, verifyPassword, signToken } from "../services/auth.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readCredentials(body: unknown) {
  const b = (body ?? {}) as { email?: unknown; password?: unknown };
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  return { email, password };
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { email, password } = readCredentials(req.body);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  // bcrypt only uses the first 72 bytes, so reject anything longer
  if (password.length < 8 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: "Password must be 8 to 72 characters" });
  }

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password) },
      select: { id: true, email: true },
    });
    res.status(201).json({ token: signToken(user.id), user });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return res.status(409).json({ error: "This email is already registered" });
    }
    throw err;
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = readCredentials(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  // Same message for "no such email" and "wrong password" on purpose
  if (!user || !valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  res.json({ token: signToken(user.id), user: { id: user.id, email: user.email } });
});

// GET /api/auth/me: who am I? (used when the page loads)
router.get("/me", requireAuth, async (_req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: res.locals.userId as number },
    select: { id: true, email: true },
  });
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  res.json(user);
});

export default router;