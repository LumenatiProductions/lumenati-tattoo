import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumenati Tattoo",
  description: "Lumenati Tattoo // custom tattoos // Denver, CO",
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
