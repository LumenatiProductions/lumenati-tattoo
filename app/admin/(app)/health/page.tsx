import { redirect } from "next/navigation";

// health moved into Settings (2026-09-01).
export default function Redirect() {
  redirect("/admin/settings?tab=health");
}
