"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function NoAccess({ email }: { email: string }) {
  const router = useRouter();
  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 text-ink antialiased">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/6 p-6 text-center shadow-sm">
        <div className="text-base font-semibold">Not on the team yet</div>
        <p className="mt-1 text-sm text-white/70">
          <span className="font-medium">{email}</span> isn&apos;t set up for the
          command center. Ask a co-owner to add you.
        </p>
        <button
          onClick={logout}
          className="mt-4 rounded-lg border border-white/12 px-3 py-1.5 text-sm font-medium text-white/75 hover:bg-white/6"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
