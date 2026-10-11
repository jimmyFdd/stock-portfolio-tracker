import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import Dashboard from "@/components/Dashboard";
import UserDirectory from "@/components/UserDirectory";
import { getCurrentDbUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { userId } = await auth();

  // Signed-out: marketing/sign-in landing.
  if (!userId) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
        <h1 className="text-4xl font-bold text-white">Track. Share. Compare.</h1>
        <p className="mt-3 max-w-md text-slate-400">
          A social stock portfolio tracker — live prices, real-time P&amp;L, interactive
          charts, and micro/macro news. Create an account to build your portfolio and
          browse what other investors are holding.
        </p>
        <div className="mt-6 flex gap-3">
          <SignUpButton mode="modal">
            <button className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover">
              Get started
            </button>
          </SignUpButton>
          <SignInButton mode="modal">
            <button className="rounded-lg border border-surface-border px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-brand hover:text-white">
              Sign in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  // Ensure a local User row exists for the signed-in Clerk user. If the database
  // is unreachable, getCurrentDbUser logs the exact error server-side and throws;
  // show a friendly message here instead of crashing the whole page.
  try {
    await getCurrentDbUser();
  } catch {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold text-white">We couldn&apos;t reach the database</h1>
        <p className="mt-3 text-slate-400">
          Your account is fine, but we&apos;re having trouble loading your portfolio right
          now. Please try again in a moment. The error has been logged for us to look into.
        </p>
        <a
          href="/"
          className="mt-6 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Retry
        </a>
      </main>
    );
  }

  return (
    <PortfolioProvider>
      <Dashboard directory={<UserDirectory />} />
    </PortfolioProvider>
  );
}
