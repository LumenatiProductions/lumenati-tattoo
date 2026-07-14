import { createAdminClient } from "@/lib/supabase/admin";
import { isStripeConfigured } from "@/lib/stripe/client";
import { connectChargeParams } from "@/lib/stripe/connect";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";
import TipAndPay from "./TipAndPay";

export const dynamic = "force-dynamic";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const KIND_LABEL: Record<string, string> = {
  deposit: "Deposit",
  ticket: "Tattoo",
  other: "Payment",
};

type Row = {
  id: string;
  shop_id: string;
  booking_id: string | null;
  artist_id: string | null;
  kind: string;
  amount_cents: number;
  tip_cents?: number | null;
  status: string;
  pay_token: string;
};

// Public, token-gated payment portal. Server component: reads its single row via
// the service-role client (never client RLS). The "Pay" button is a plain link to
// /pay/<token>/checkout, which mints a Stripe Checkout session and redirects, so
// card data never touches our origin and no client JS is required.
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { token } = await params;
  const { status: returnStatus } = await searchParams;
  const admin = createAdminClient();

  const row = admin
    ? (
        await admin.from("payments").select("*").eq("pay_token", token).maybeSingle<Row>()
      ).data
    : null;

  // Enrich with artist name + service for a friendlier line (best-effort).
  let artistName: string | null = null;
  let serviceDesc: string | null = null;
  if (admin && row) {
    if (row.artist_id) {
      const { data } = await admin.from("artists").select("name").eq("id", row.artist_id).maybeSingle();
      artistName = data?.name ?? null;
    }
    if (row.booking_id) {
      const { data } = await admin
        .from("bookings")
        .select("service_desc")
        .eq("id", row.booking_id)
        .maybeSingle();
      serviceDesc = (data?.service_desc as string)?.trim() || null;
    }
  }

  // Does this payment route to a connected account? If so the client covers the
  // card fee (surcharge), disclosed below and computed live as they pick a tip.
  let surcharged = false;
  if (admin && row && (row.kind === "ticket" || row.kind === "other")) {
    const split = await connectChargeParams(admin, {
      shopId: row.shop_id,
      artistId: row.artist_id,
      kind: row.kind,
      baseCents: row.amount_cents,
    });
    surcharged = !!split;
  }

  const paid = row?.status === "paid" || returnStatus === "success";
  const invalid = !row;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0e0e11] p-5 font-sans">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-[#0e0e11] px-6 py-5">
          <LumenatiLogo bg="dark" className="w-24" />
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-white/50">
            Secure payment
          </div>
        </div>

        <div className="px-6 py-7">
          {invalid ? (
            <State
              title="Link not valid"
              body="This payment link is incomplete or has expired. Ask the shop for a new one."
            />
          ) : paid ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
                ✓
              </div>
              <div className="text-lg font-bold text-ink">Paid</div>
              <div className="mt-1 text-sm text-black/55">
                {usd(row!.amount_cents + (row!.tip_cents ?? 0))} received
                {(row!.tip_cents ?? 0) > 0 ? ` (including a ${usd(row!.tip_cents!)} tip — thank you!)` : ""}. You can close this page.
              </div>
              {row!.status !== "paid" && (
                <div className="mt-3 text-xs text-black/40">
                  Still confirming with our processor; this updates automatically.
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-black/45">
                {KIND_LABEL[row!.kind] ?? "Payment"}
                {artistName ? ` · ${artistName}` : ""}
              </div>
              {serviceDesc && <div className="mt-1 text-sm text-black/60">{serviceDesc}</div>}
              <div className="mt-3 text-4xl font-extrabold tracking-tight text-ink">
                {usd(row!.amount_cents)}
              </div>

              {returnStatus === "canceled" && (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Payment canceled. You can try again below.
                </div>
              )}

              {isStripeConfigured ? (
                <TipAndPay
                  token={token}
                  amountCents={row!.amount_cents}
                  kind={row!.kind}
                  surcharged={surcharged}
                />
              ) : (
                <div className="mt-5 rounded-lg bg-black/5 px-3 py-3 text-center text-xs text-black/50">
                  Payments aren&apos;t enabled yet. Please pay at the shop.
                </div>
              )}

              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-black/40">
                <span>Secured by Stripe</span>
                <span>·</span>
                <span>We never see your card details</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function State({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-ink">{title}</div>
      <div className="mt-1 text-sm text-black/55">{body}</div>
    </div>
  );
}
