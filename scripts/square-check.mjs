// One-off: validate the Square token + preview the account's data.
const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const BASE = "https://connect.squareup.com";
const V = process.env.SQUARE_VERSION || "2025-04-16";

async function sq(path, init) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Square-Version": V,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(b.errors || b)}`);
  return b;
}

try {
  const locs = await sq("/v2/locations");
  console.log(
    "LOCATIONS:",
    (locs.locations || []).map((l) => `${l.name} [${l.id}]`).join(", ") || "none",
  );

  const tm = await sq("/v2/team-members/search", {
    method: "POST",
    body: JSON.stringify({ query: { filter: { status: "ACTIVE" } }, limit: 200 }),
  });
  const members = (tm.team_members || []).map((m) =>
    [m.given_name, m.family_name].filter(Boolean).join(" "),
  );
  console.log(`TEAM MEMBERS (${members.length}):`, members.join(", ") || "none");

  const begin = new Date(Date.now() - 31 * 86400000).toISOString();
  let count = 0,
    cursor,
    pages = 0;
  do {
    const params = new URLSearchParams({ begin_time: begin, limit: "100", sort_order: "ASC" });
    if (cursor) params.set("cursor", cursor);
    const p = await sq(`/v2/payments?${params}`);
    count += (p.payments || []).length;
    cursor = p.cursor;
    pages++;
  } while (cursor && pages < 50);
  console.log(`PAYMENTS last 31d: ${count} (across ${pages} page(s))`);
} catch (e) {
  console.error("SQUARE ERROR:", e.message);
}
