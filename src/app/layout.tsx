import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppTopNav } from "@/components/AppTopNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "매장 도면 실험",
  description: "도면 위 매대·단별 매출 조회 라이브러리 비교",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden">
        <AppTopNav />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
