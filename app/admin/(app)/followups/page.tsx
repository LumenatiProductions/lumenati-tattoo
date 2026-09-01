import { redirect } from "next/navigation";

// followups moved into the Messages page (2026-09-01: one Messages page, many tabs).
export default function Redirect() {
  redirect("/admin/messages?tab=queue");
}
