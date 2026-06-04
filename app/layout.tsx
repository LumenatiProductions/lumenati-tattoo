import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumenati Tattoo",
  description: "Lumenati Tattoo // step into the bedroom",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
