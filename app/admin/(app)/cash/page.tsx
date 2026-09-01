import { redirect } from "next/navigation";

// cash moved into the Money page (2026-09-01: one Money page, many tabs).
// Old links and bookmarks land on the right tab.
export default function Redirect() {
  redirect("/admin/money?tab=cash");
}
