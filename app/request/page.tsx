import { createAdminClient } from "@/lib/supabase/admin";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";
import RequestForm from "./RequestForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Book a tattoo — Lumenati Tattoo",
  description: "Tell us what you want and we'll get you in the chair.",
};

// Public booking-request page. Lives OUTSIDE the (site) route group on purpose
// — same clean parent-brand shell as /intake and /pay, no Y2K bundle. The Y2K
// site links here when Scott wants it to; nothing on the public site changed.
export default async function RequestPage() {
  const admin = createAdminClient();
  let artists: { id: string; name: string }[] = [];
  if (admin) {
    const { data } = await admin
      .from("artists")
      .select("id, name")
      .eq("active", true)
      .order("sort");
    artists = (data ?? []).map((a) => ({ id: a.id as string, name: a.name as string }));
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="bg-[#0e0e11] px-5 py-5">
        <div className="mx-auto max-w-xl">
          <LumenatiLogo bg="dark" className="w-28" />
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.3em] text-zinc-400">Book a tattoo</div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-5 py-6">
        <RequestForm artists={artists} />
      </main>
    </div>
  );
}
