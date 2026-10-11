// Prisma client singleton.
//
// In dev, Next.js hot-reload would otherwise create a new client on every
// module reload and exhaust the DB connection pool. Caching it on globalThis
// avoids that.

import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
