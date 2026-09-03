import KioskLayout from "@/app/kiosk/layout";

// /tv wears the kiosk shell (same fonts, same CRT look, the arcade cabinet
// mounted once) without any of the check-in screens.
export const metadata = {
  title: "Lumenati // Shop TV",
  appleWebApp: { capable: true, title: "Lumenati TV", statusBarStyle: "black-translucent" as const },
};

export const viewport = {
  themeColor: "#06060a",
  viewportFit: "cover" as const,
  width: "device-width",
  initialScale: 1,
};

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return <KioskLayout>{children}</KioskLayout>;
}
