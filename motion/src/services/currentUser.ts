import { prisma } from "../db/prisma.js";

const DEMO_EMAIL = "demo@example.com";
let cachedId: number | null = null;

// Temporary: replaced by the logged-in user when we add auth
export async function getCurrentUserId(): Promise<number> {
  if (cachedId) return cachedId;

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash: "not-used" },
  });

  cachedId = user.id;
  return cachedId;
}