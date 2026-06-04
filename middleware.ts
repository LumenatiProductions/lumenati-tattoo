import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Only run on the admin area + auth callback; the public Y2K site is untouched.
export const config = {
  matcher: ["/admin/:path*", "/auth/:path*"],
};
