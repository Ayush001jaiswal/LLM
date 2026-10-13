import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/auth.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  const userId = scheme === "Bearer" && token ? verifyToken(token) : null;

  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  res.locals.userId = userId;
  next();
}