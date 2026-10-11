"use client";

import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

export default function NavBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-surface-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm">↗</span>
          Portfolio Tracker
        </Link>
        <nav className="flex items-center gap-2">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-white">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover">
                Sign up
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <UserButton
              appearance={{ elements: { avatarBox: "h-8 w-8" } }}
              afterSignOutUrl="/"
            />
          </SignedIn>
        </nav>
      </div>
    </header>
  );
}
