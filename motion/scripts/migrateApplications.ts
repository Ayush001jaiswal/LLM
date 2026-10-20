import { prisma } from "../src/db/prisma.js";

async function main() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "JobApplication" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "resumeId" INTEGER REFERENCES "Resume"("id") ON DELETE SET NULL,
        "company" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "location" TEXT,
        "salary" TEXT,
        "jobUrl" TEXT,
        "status" TEXT NOT NULL DEFAULT 'bookmarked',
        "leadName" TEXT,
        "leadTitle" TEXT,
        "leadEmail" TEXT,
        "leadLinkedin" TEXT,
        "outreachNotes" TEXT,
        "appliedAt" TIMESTAMP(3),
        "nextFollowUpAt" TIMESTAMP(3),
        "lastContactedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "JobApplication_userId_idx" ON "JobApplication"("userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "JobApplication_status_idx" ON "JobApplication"("status");
    `);
    console.log("SUCCESS: JobApplication table verified & ready");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
