import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Robustly search for .env in current directory, parent directory, and motion folder
const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "motion", ".env"),
  resolve(__dirname, "../../.env"),
  resolve(__dirname, "../../../.env"),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("CRITICAL ERROR: DATABASE_URL is not set in environment or any .env file.");
}

const adapter = new PrismaPg({ connectionString: connectionString || "" });

export const prisma = new PrismaClient({ adapter });