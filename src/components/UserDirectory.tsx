// Server component: lists other people on the app, linking to their public
// profiles. Queries the DB directly (no API round-trip).

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser } from "@/lib/user";

export default async function UserDirectory() {
  const me = await getCurrentDbUser();

  const users = await prisma.user.findMany({
    where: me ? { NOT: { id: me.id } } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { positions: true } } },
  });

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Investors
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Browse other members and view their public portfolios.
      </p>

      {users.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No one else here yet — invite a friend!
        </p>
      ) : (
        <ul className="flex max-h-[520px] flex-col gap-1 overflow-y-auto pr-1">
          {users.map((u) => (
            <li key={u.id}>
              <Link
                href={`/profile/${encodeURIComponent(u.username)}`}
                className="group flex items-center gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-surface-border hover:bg-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {u.imageUrl ? (
                  <img
                    src={u.imageUrl}
                    alt=""
                    className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-brand/20 text-sm font-semibold text-brand">
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {u.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    <span className="text-brand group-hover:underline">@{u.username}</span>{" "}
                    · {u._count.positions} position
                    {u._count.positions === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
