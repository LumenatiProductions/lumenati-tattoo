import { redirect } from "next/navigation";

// billing moved into Settings (2026-09-01).
export default function Redirect() {
  redirect("/admin/settings?tab=billing");
}
