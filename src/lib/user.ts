// Server-side helpers that bridge Clerk identities to local User rows.
//
// Clerk owns authentication; we keep a mirror `User` row so positions can be
// linked by a stable local id and so the social directory / public profiles can
// query users without hitting Clerk.

import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./prisma";
import type { User } from "@prisma/client";

/**
 * Return the local User row for the signed-in Clerk user, creating/refreshing
 * it on demand.
 *
 * Returns null only when nobody is signed in. If the database query/upsert
 * fails, the exact error is logged to the server console and re-thrown — it is
 * NOT swallowed into a null, so callers can tell "signed out" apart from
 * "database is down" and handle each appropriately.
 */
export async function getCurrentDbUser(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? null;
  const base =
    clerkUser.username ??
    email?.split("@")[0] ??
    `user-${userId.slice(-6)}`;
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || base;

  try {
    const username = await resolveUniqueUsername(base, userId);
    try {
      return await prisma.user.upsert({
        where: { clerkId: userId },
        update: { email, username, name, imageUrl: clerkUser.imageUrl },
        create: { clerkId: userId, email, username, name, imageUrl: clerkUser.imageUrl },
      });
    } catch (e) {
      // A concurrent sign-in may have claimed the username between the check and
      // the write (unique violation P2002). Retry once with a suffixed handle.
      if (isUniqueViolation(e, "username")) {
        const fallback = `${base}-${userId.slice(-4)}`;
        return await prisma.user.upsert({
          where: { clerkId: userId },
          update: { email, username: fallback, name, imageUrl: clerkUser.imageUrl },
          create: { clerkId: userId, email, username: fallback, name, imageUrl: clerkUser.imageUrl },
        });
      }
      throw e;
    }
  } catch (e) {
    // Any genuine DB failure (connection refused, auth, timeout, constraint,
    // etc.) lands here. Log the exact error, then re-throw.
    logDbError("getCurrentDbUser", { clerkId: userId }, e);
    throw e;
  }
}

/**
 * Return a username that is free or already owned by this Clerk user, appending
 * a numeric suffix on collision (jimmy -> jimmy1 -> jimmy2 ...).
 */
async function resolveUniqueUsername(base: string, clerkId: string): Promise<string> {
  for (let n = 0; n < 1000; n++) {
    const candidate = n === 0 ? base : `${base}${n}`;
    const existing = await prisma.user.findUnique({ where: { username: candidate } });
    if (!existing || existing.clerkId === clerkId) return candidate;
  }
  // Extremely unlikely fallback: guarantee uniqueness via the Clerk id tail.
  return `${base}-${clerkId.slice(-6)}`;
}

/**
 * Log the exact database error to the server console with all the detail Prisma
 * exposes — error code, driver message, metadata, and the full stack — so
 * production failures are diagnosable instead of opaque.
 */
function logDbError(operation: string, context: Record<string, unknown>, e: unknown): void {
  const err = e as {
    name?: string;
    code?: string; // PrismaClientKnownRequestError, e.g. P1001 (unreachable), P2002
    errorCode?: string; // PrismaClientInitializationError
    message?: string;
    meta?: unknown;
    clientVersion?: string;
  };
  console.error(`[db] ${operation} failed`, {
    ...context,
    name: err?.name,
    code: err?.code ?? err?.errorCode,
    message: err?.message,
    meta: err?.meta,
    clientVersion: err?.clientVersion,
  });
  // Emit the raw error too, for the full stack trace.
  console.error(e);
}

/** Narrow a Prisma unique-constraint error (P2002) on a given field. */
function isUniqueViolation(e: unknown, field: string): boolean {
  const err = e as { code?: string; meta?: { target?: string[] | string } };
  if (err?.code !== "P2002") return false;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes(field) : target === field || target == null;
}

/** Lightweight: just the local user id (or null). Upserts if needed. */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentDbUser();
  return user?.id ?? null;
}
