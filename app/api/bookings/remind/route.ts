import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSmsConfigured, sendSms } from "@/lib/sms";
import { renderY2kEmail } from "@/lib/email/y2k";

export const dynamic = "force-dynamic";

// Send a booking reminder on demand — the desk nudging a client to confirm
// instead of waiting for the nightly cron. Text first (Reply C closes back into
// /api/sms/inbound), email as the fallback. Same rails as the accept flow.
const STAFF = ["owner", "bookkeeper", "frontdesk"] as const;
const SHOP_TZ = process.env.SHOP_TIMEZONE || "America/Denver";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("email", user.email!).maybeSingle();
  if (!profile || !STAFF.includes(profile.role as (typeof STAFF)[number])) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const { bookingId } = (await req.json().catch(() => ({}))) as { bookingId?: string };
  if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, starts_at, client_id, artist_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!booking.client_id) {
    return NextResponse.json({ error: "No client on this booking to remind." }, { status: 400 });
  }

  const [{ data: client }, { data: artist }] = await Promise.all([
    supabase.from("clients").select("first_name, phone, email").eq("id", booking.client_id).maybeSingle(),
    booking.artist_id
      ? supabase.from("artists").select("name").eq("id", booking.artist_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!client) return NextResponse.json({ error: "Client record missing." }, { status: 404 });

  const when = new Date(booking.starts_at as string).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SHOP_TZ,
  });
  const firstName = (client.first_name as string) || "there";
  const artistWith = artist?.name ? ` with ${artist.name}` : "";
  const text = `Hi ${firstName}, this is Lumenati Tattoo. You're booked ${when}${artistWith}. Reply C to confirm, or call the shop if you need to move it.`;

  // Text first.
  if (client.phone && isSmsConfigured) {
    const sms = await sendSms(client.phone as string, text);
    if (sms.ok) return NextResponse.json({ ok: true, sent: true, via: "sms" });
    if (!client.email) return NextResponse.json({ error: sms.error || "Text failed." }, { status: 502 });
  }

  // Email fallback.
  if (client.email && process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Lumenati Tattoo <onboarding@resend.dev>",
        to: [client.email],
        subject: `Reminder: your appointment is ${when}`,
        html: renderY2kEmail({
          windowTitle: "reminder.exe",
          headline: `You're booked ${when}.`,
          paragraphs: [
            `${artistWith ? `Your session${artistWith} is coming up.` : "Your session is coming up."} Reply to this email or call the shop if you need to move it.`,
            "Eat beforehand, stay hydrated, and bring your ID.",
          ],
        }),
      }),
    });
    if (res.ok) return NextResponse.json({ ok: true, sent: true, via: "email" });
    return NextResponse.json({ error: `Email failed (${res.status}).` }, { status: 502 });
  }

  return NextResponse.json(
    { error: "No reachable contact, or texting/email isn't configured yet." },
    { status: 422 },
  );
}
