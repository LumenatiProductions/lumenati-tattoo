// Bring-your-people-over importer (2026-09-01). A shop switching to Lumenati
// exports a spreadsheet from whatever it used (Square, Booksy, Vagaro, Fresha,
// Mindbody, GlossGenius, Acuity, Podium, Mailchimp, Klaviyo...) and we read
// it: clients with contact + last visit, or appointments onto the right chair.
// No partner APIs, no OAuth: every one of those tools exports CSV today.

export type Role =
  | "first_name"
  | "last_name"
  | "full_name"
  | "email"
  | "phone"
  | "instagram"
  | "notes"
  | "birthday"
  | "first_visit"
  | "last_visit"
  | "total_spent"
  | "opt_in"
  | "date"
  | "time"
  | "datetime"
  | "staff"
  | "service"
  | "price"
  | "status";

export const ROLE_LABEL: Record<Role, string> = {
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name",
  email: "Email",
  phone: "Phone",
  instagram: "Instagram",
  notes: "Notes",
  birthday: "Birthday",
  first_visit: "First visit",
  last_visit: "Last visit",
  total_spent: "Total spent",
  opt_in: "Marketing opt-in",
  date: "Appointment date",
  time: "Appointment time",
  datetime: "Appointment date + time",
  staff: "Artist / staff",
  service: "Service",
  price: "Price",
  status: "Status",
};

// Header synonyms, lowercased, punctuation stripped. First match wins, and
// specific names are listed before loose ones on purpose.
const SYNONYMS: [Role, string[]][] = [
  ["first_name", ["first name", "firstname", "first", "given name", "client first name", "customer first name"]],
  ["last_name", ["last name", "lastname", "last", "surname", "family name", "client last name", "customer last name"]],
  ["full_name", ["client name", "customer name", "client", "customer", "name", "full name", "contact name", "guest name", "member name"]],
  ["email", ["email address", "email", "e mail", "client email", "customer email", "primary email"]],
  ["phone", ["phone number", "mobile number", "mobile phone", "cell phone", "cell", "mobile", "phone", "telephone", "primary phone", "client phone", "customer phone", "sms number"]],
  ["instagram", ["instagram", "ig", "ig handle", "instagram handle", "handle"]],
  ["birthday", ["birthday", "birthdate", "date of birth", "dob", "birth date"]],
  ["first_visit", ["first visit", "first appointment", "first seen", "client since", "customer since", "created", "created at", "date created", "join date", "signup date"]],
  ["last_visit", ["last visit", "last appointment", "last seen", "last visit date", "last booking", "last service date", "last activity"]],
  ["total_spent", ["total spent", "lifetime spend", "lifetime value", "total sales", "total revenue", "spend", "amount spent"]],
  ["opt_in", ["marketing opt in", "opt in", "optin", "subscribed", "subscription status", "email status", "email marketing consent", "sms consent", "marketing consent", "accepts marketing", "member status"]],
  ["datetime", ["start time", "start", "appointment start", "start date time", "datetime", "date time", "appointment date time", "start at", "starts at"]],
  ["date", ["appointment date", "date", "booking date", "service date", "visit date", "day"]],
  ["time", ["appointment time", "time", "booking time", "start time of day"]],
  ["staff", ["staff", "staff member", "staff name", "team member", "artist", "provider", "employee", "stylist", "technician", "resource", "assigned to"]],
  ["service", ["service", "service name", "services", "appointment type", "item", "description", "treatment"]],
  ["price", ["price", "amount", "total", "service price", "cost", "revenue", "sale amount", "net sales", "gross sales"]],
  ["status", ["status", "appointment status", "booking status", "state"]],
  ["notes", ["notes", "note", "client notes", "customer notes", "comments", "memo", "internal notes"]],
];

export const PRESETS: { key: string; label: string; hint: string }[] = [
  { key: "square", label: "Square", hint: "Customers → Export, or Appointments → Export." },
  { key: "booksy", label: "Booksy", hint: "Clients → Export to CSV." },
  { key: "vagaro", label: "Vagaro", hint: "Reports → Customers → Export, or Appointments → Export." },
  { key: "fresha", label: "Fresha", hint: "Clients → Export." },
  { key: "mindbody", label: "Mindbody", hint: "Reports → Clients → Export." },
  { key: "glossgenius", label: "GlossGenius", hint: "Clients → Export client list." },
  { key: "acuity", label: "Acuity / Squarespace Scheduling", hint: "Clients → Export, or Appointments → Export." },
  { key: "podium", label: "Podium", hint: "Contacts → Export. Opt-in status comes with it." },
  { key: "mailchimp", label: "Mailchimp", hint: "Audience → Export audience. Only subscribed contacts get marketing consent." },
  { key: "klaviyo", label: "Klaviyo", hint: "Lists → Export. Consent column is honored." },
  { key: "constantcontact", label: "Constant Contact", hint: "Contacts → Export." },
  { key: "other", label: "Something else", hint: "Any spreadsheet with a name and a phone or email works." },
];

export const presetLabel = (key: string) => PRESETS.find((p) => p.key === key)?.label ?? "a spreadsheet";

const norm = (h: string) =>
  h
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[_\-./()]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF, trailing newline.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

export type Mapping = Partial<Record<Role, number>>; // role -> column index

export function detectMapping(headers: string[]): Mapping {
  const normed = headers.map(norm);
  const used = new Set<number>();
  const mapping: Mapping = {};
  for (const [role, names] of SYNONYMS) {
    for (const n of names) {
      const idx = normed.findIndex((h, i) => !used.has(i) && h === n);
      if (idx >= 0) {
        mapping[role] = idx;
        used.add(idx);
        break;
      }
    }
  }
  // Loose second pass: header CONTAINS the synonym (e.g. "Client Phone (Mobile)").
  for (const [role, names] of SYNONYMS) {
    if (mapping[role] != null) continue;
    for (const n of names) {
      if (n.length < 5) continue;
      const idx = normed.findIndex((h, i) => !used.has(i) && h.includes(n));
      if (idx >= 0) {
        mapping[role] = idx;
        used.add(idx);
        break;
      }
    }
  }
  // A bare "Status" column means subscribed/unsubscribed on a contact list and
  // accepted/cancelled on an appointment list. Let the file's shape decide.
  if (mapping.status != null && mapping.opt_in == null && detectKind(mapping) === "clients") {
    mapping.opt_in = mapping.status;
    delete mapping.status;
  }
  return mapping;
}

export type Kind = "clients" | "appointments";
export function detectKind(m: Mapping): Kind {
  const hasWhen = m.datetime != null || (m.date != null && (m.time != null || m.staff != null || m.service != null));
  return hasWhen ? "appointments" : "clients";
}

export const digits = (s: string) => s.replace(/\D/g, "");
export function normalizePhoneLoose(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = digits(raw);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length >= 11 && d.length <= 15) return `+${d}`;
  return null;
}
export const normalizeEmail = (raw: string | undefined) => {
  const e = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};

export function splitName(full: string): { first: string; last: string } {
  const t = full.trim().replace(/\s+/g, " ");
  if (!t) return { first: "", last: "" };
  if (t.includes(",")) {
    const [l, f] = t.split(",").map((x) => x.trim());
    return { first: f ?? "", last: l ?? "" };
  }
  const parts = t.split(" ");
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// "yes", "true", "subscribed", "opted in", "1" => true. Anything else false.
export const truthy = (raw: string | undefined) =>
  /^(yes|y|true|1|subscribed|opted ?in|opt ?in|active|consented|granted)$/i.test((raw ?? "").trim());

// Many date shapes land in these exports. Returns YYYY-MM-DD or null.
export function parseDateLoose(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

// "2:30 PM", "14:30", "2pm" => minutes since midnight; null when unreadable.
export function parseTimeLoose(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = (m[3] ?? "").toLowerCase().replace(/\./g, "");
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Dollars from "$1,250.00", "1250", "1,250" => cents.
export function parseMoneyLoose(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
