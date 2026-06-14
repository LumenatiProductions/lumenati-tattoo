import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { isSmsConfigured, sendSms } from "@/lib/sms";
import { renderY2kEmail } from "@/lib/email/y2k";

export const dynamic = "force-dynamic";

// Message a client about their booking on demand — either a reminder/confirm
// nudge or a "we moved your time" note after a reschedule. Text first (Reply C
// closes back into /api/sms/inbound), email as the fallback. Same rails as the
// accept flow. Cookie (desk) OR Bearer (app) auth via resolveStaff.
const STAFF = ["owner", "bookkeeper", "frontdesk"] as const;
const SHOP_TZ = process.env.SHOP_TIMEZONE || "America/Denver";

export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!STAFF.includes(me.role as (typeof STAFF)[number])) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const { bookingId, kind } = (await req.json().catch(() => ({}))) as {
    bookingId?: string;
    kind?: "reminder" | "reschedule";
  };
  if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
  const reschedule = kind === "reschedule";

  const { data: booking } = await me.db
    .from("bookings")
    .select("id, starts_at, client_id, artist_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (!booking.client_id) {
    return NextResponse.json({ error: "No client on this booking to notify." }, { status: 400 });
  }

  const [{ data: client }, { data: artist }] = await Promise.all([
    me.db.from("clients").select("first_name, phone, email").eq("id", booking.client_id).maybeSingle(),
    booking.artist_id
      ? me.db.from("artists").select("name").eq("id", booking.artist_id).maybeSingle()
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
  const text = reschedule
    ? `Hi ${firstName}, this is Lumenati Tattoo. Your appointment has moved to ${when}${artistWith}. Reply C to confirm, or call the shop if that doesn't work.`
    : `Hi ${firstName}, this is Lumenati Tattoo. You're booked ${when}${artistWith}. Reply C to confirm, or call the shop if you need to move it.`;

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
        subject: reschedule ? `Your appointment time changed — now ${when}` : `Reminder: your appointment is ${when}`,
        html: renderY2kEmail({
          windowTitle: reschedule ? "new_time.exe" : "reminder.exe",
          headline: reschedule ? `Your appointment moved to ${when}.` : `You're booked ${when}.`,
          paragraphs: [
            reschedule
              ? `${artistWith ? `Your session${artistWith} has a new time.` : "Your session has a new time."} Reply to this email or call the shop if that doesn't work.`
              : `${artistWith ? `Your session${artistWith} is coming up.` : "Your session is coming up."} Reply to this email or call the shop if you need to move it.`,
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
