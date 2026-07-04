import { redirect } from "next/navigation";

// /book was a dead duplicate of /contact. The real booking flow is /request
// (public booking-request form → deposit link). Send /book straight there so
// the intuitive URL actually books.
export default function BookPage() {
  redirect("/request");
}
