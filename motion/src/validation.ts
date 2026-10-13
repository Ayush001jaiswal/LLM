import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email is too long")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    // bcrypt only reads the first 72 bytes, so reject anything longer
    .refine((p) => Buffer.byteLength(p) <= 72, "Password is too long (max 72 bytes)"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1, "Password is required").max(200),
});

export const chatSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(4000, "Message too long (max 4000 characters)"),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
});

// Returns the parsed data, or null after sending a 400 response
import type { Response } from "express";

export function parseBody<S extends z.ZodType>(
  schema: S,
  body: unknown,
  res: Response
): z.infer<S> | null {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Invalid input" });
    return null;
  }
  return result.data;
}