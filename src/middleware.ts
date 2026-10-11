import { clerkMiddleware } from "@clerk/nextjs/server";

// clerkMiddleware() makes auth() available in routes/components. It does NOT
// protect any routes by default — every page is public, and we gate content
// per-page with auth(). Public profiles stay viewable by anyone.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run on API routes.
    "/(api|trpc)(.*)",
    // Clerk's auto-proxy path.
    "/__clerk/:path*",
  ],
};
