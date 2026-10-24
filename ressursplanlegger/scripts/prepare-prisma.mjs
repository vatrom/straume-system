import fs from "node:fs";
import path from "node:path";

const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
const text = fs.readFileSync(schemaPath, "utf8");
const url = process.env.DATABASE_URL ?? "";
const provider = url.startsWith("postgres") ? "postgresql" : "sqlite";
const next = text.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${provider}"`);
if (next !== text) fs.writeFileSync(schemaPath, next);
console.log(`Prisma-provider: ${provider}`);
