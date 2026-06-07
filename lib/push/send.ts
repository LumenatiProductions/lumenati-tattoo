import type { SupabaseClient } from "@supabase/supabase-js";

// Expo push delivery (POS-STARTER-6, last mile). SERVER ONLY. Sends through
// Expo's push service — no APNs/FCM keys needed on our side; the app registers
// an ExponentPushToken and we POST to Expo. Best-effort: a failed send never
// breaks the daily job.

export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
): Promise<{ sent: number; ok: boolean }> {
  const valid = [...new Set(tokens)].filter((t) => t.startsWith("ExponentPushToken"));
  if (!valid.length) return { sent: 0, ok: true };
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(valid.map((to) => ({ to, title, body, sound: "default" }))),
    });
    return { sent: valid.length, ok: res.ok };
  } catch {
    return { sent: 0, ok: false };
  }
}

// Tokens for everyone whose current role is in `roles` (role resolved live from
// `profiles` by the email stored on the device row).
export async function tokensForRoles(admin: SupabaseClient, roles: string[]): Promise<string[]> {
  const { data: devices } = await admin.from("device_tokens").select("token, email");
  const rows = (devices ?? []) as { token: string; email: string | null }[];
  const emails = [...new Set(rows.map((d) => d.email).filter(Boolean) as string[])];
  if (!emails.length) return [];
  const { data: profs } = await admin.from("profiles").select("email, role").in("email", emails);
  const roleByEmail = new Map(((profs ?? []) as { email: string; role: string }[]).map((p) => [p.email, p.role]));
  return rows.filter((d) => d.email && roles.includes(roleByEmail.get(d.email) ?? "")).map((d) => d.token);
}
