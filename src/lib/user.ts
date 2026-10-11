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
 * it on demand. Returns null when nobody is signed in.
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

  const username = await resolveUniqueUsername(base, userId);

  try {
    return await prisma.user.upsert({
      where: { clerkId: userId },
      update: { email, username, name, imageUrl: clerkUser.imageUrl },
      create: { clerkId: userId, email, username, name, imageUrl: clerkUser.imageUrl },
    });
  } catch (e) {
    // A concurrent sign-in may have claimed the username between the check and
    // the write (unique violation P2002). Retry once with a random suffix.
    if (isUniqueViolation(e, "username")) {
      const fallback = `${base}-${userId.slice(-4)}`;
      return prisma.user.upsert({
        where: { clerkId: userId },
        update: { email, username: fallback, name, imageUrl: clerkUser.imageUrl },
        create: { clerkId: userId, email, username: fallback, name, imageUrl: clerkUser.imageUrl },
      });
    }
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
