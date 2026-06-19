import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ara Cinta Indonesia · WordPress 블로그 작성기",
  description: "WordPress AdSense 승인 준비용 인도네시아어 블로그 글 작성·검수·발행 보조 도구",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
