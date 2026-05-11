import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing");
}

const url = new URL(databaseUrl);

// Create the adapter using the config object directly as requested
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace("/", ""),
  connectionLimit: 5,
});

const globalForPrisma = global as unknown as { prisma: PrismaClient };

console.log("[BOOT] prisma init");

export const prisma = (() => {
  try {
    const client = new PrismaClient({
      adapter,
      log: ["error", "warn"],
    });
    console.log("[BOOT] prisma init complete");
    return client;
  } catch (error) {
    console.error("[BOOT] prisma init failed:", error);
    throw error;
  }
})();

console.log("[DB] Prisma initialized. Models:", Object.keys(prisma).filter(k => !k.startsWith("$") && !k.startsWith("_")));
if ((prisma as any).attendanceImageRecord) {
  console.log("[DB] AttendanceImageRecord fields:", Object.keys((prisma as any).attendanceImageRecord.fields));
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
