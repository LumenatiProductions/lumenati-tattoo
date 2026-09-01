import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { parseCsv, detectMapping, detectKind, ROLE_LABEL, type Role } from "@/lib/import/csv";

export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024;

// Owner uploads a CSV; we say what we see in it before anything is written:
// which columns mean what, whether it's a client list or an appointment list,
// a few sample rows, and (for appointments) the staff names that need a chair.
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (me.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { csv?: string };
  const csv = typeof b.csv === "string" ? b.csv : "";
  if (!csv.trim()) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (csv.length > MAX_BYTES) return NextResponse.json({ error: "That file is over 6 MB. Split it and try again." }, { status: 400 });

  const rows = parseCsv(csv);
  if (rows.length < 2) return NextResponse.json({ error: "Need a header row and at least one row of people." }, { status: 400 });
  const headers = rows[0].map((h) => h.trim());
  const mapping = detectMapping(headers);
  const kind = detectKind(mapping);
  const data = rows.slice(1);

  const staffIdx = mapping.staff;
  const staffNames =
    kind === "appointments" && staffIdx != null
      ? [...new Set(data.map((r) => (r[staffIdx] ?? "").trim()).filter(Boolean))].slice(0, 50)
      : [];

  const warnings: string[] = [];
  if (kind === "clients" && mapping.full_name == null && mapping.first_name == null) warnings.push("No name column found. Pick one below.");
  if (kind === "clients" && mapping.phone == null && mapping.email == null) warnings.push("No phone or email column found. Without one we can't tell people apart.");
  if (kind === "appointments" && staffIdx == null) warnings.push("No artist / staff column. Every appointment will land on the chair you pick below.");

  return NextResponse.json({
    ok: true,
    kind,
    headers,
    mapping,
    roles: Object.keys(ROLE_LABEL) as Role[],
    roleLabels: ROLE_LABEL,
    rowCount: data.length,
    sample: data.slice(0, 5),
    staffNames,
    warnings,
  });
}
