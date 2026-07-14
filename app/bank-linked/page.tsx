import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

export const dynamic = "force-dynamic";

// Where Stripe returns an ARTIST after they link their bank from the app. Stripe
// can only return to an https page, not the app itself, so this is a friendly
// dead-end telling them to head back to the app — which re-checks their status
// on focus. `?state=refresh` means the link expired mid-flow (start over).
export default async function BankLinked({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const restart = state === "refresh";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0e0e11] p-5 font-sans">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-[#0e0e11] px-6 py-5">
          <LumenatiLogo bg="dark" className="w-24" />
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-white/50">
            Get paid
          </div>
        </div>
        <div className="px-6 py-8 text-center">
          {restart ? (
            <>
              <div className="text-lg font-bold text-ink">Let&apos;s try that again</div>
              <div className="mt-1.5 text-sm text-black/55">
                That setup link timed out. Head back to the Lumenati app and tap{" "}
                <span className="font-semibold">Link your bank</span> once more.
              </div>
            </>
          ) : (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
                ✓
              </div>
              <div className="text-lg font-bold text-ink">You&apos;re all set</div>
              <div className="mt-1.5 text-sm text-black/55">
                Your bank is linked. Head back to the Lumenati app — your card sales flow straight to
                you, and you can get paid early right from your phone.
              </div>
            </>
          )}
          <div className="mt-5 text-xs text-black/40">You can close this page.</div>
        </div>
      </div>
    </main>
  );
}
