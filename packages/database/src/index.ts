import { PrismaClient } from "@prisma/client";

// Singleton Prisma client for the whole platform. Apps and services import
// { db } from "@rhino/database" instead of instantiating their own client.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export * from "@prisma/client";
