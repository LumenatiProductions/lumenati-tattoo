import { redirect } from "next/navigation";

// integrations moved into Settings (2026-09-01); Square is history-only.
export default function Redirect() {
  redirect("/admin/settings?tab=square");
}
