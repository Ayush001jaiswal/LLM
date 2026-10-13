import { prisma } from "./db/prisma.js";

async function main() {
  const user = await prisma.user.create({
    data: { email: "test@example.com", passwordHash: "temporary" },
  });
  console.log("Created:", user);

  const count = await prisma.user.count();
  console.log("Total users:", count);
}

main().finally(() => prisma.$disconnect());