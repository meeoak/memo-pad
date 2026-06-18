import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ara Cinta Indonesia Content Desk",
  description: "AdSense readiness writing and publishing assistant for Ara Cinta Indonesia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
