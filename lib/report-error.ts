// Minimal error reporting, SERVER ONLY. Posts a one-liner to ALERT_WEBHOOK_URL
// (any Slack-compatible incoming webhook) when set; silent no-op otherwise.
// Deliberately tiny — when the shop outgrows this, swap in Sentry behind the
// same function and nothing else changes.

export async function reportError(where: string, error: unknown): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const message = error instanceof Error ? `${error.message}\n${(error.stack ?? "").slice(0, 600)}` : String(error);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Lumenati error · ${where}\n${message.slice(0, 1200)}` }),
    });
  } catch {
    /* never let the reporter throw */
  }
}
