import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { FitToScreen } from "@/components/FitToScreen";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "When Life Gives You Tangerines",
  description: "Will this customer make it? A financial resilience engine built on real bank data.",
  icons: { icon: "/tangerine.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex h-dvh flex-col overflow-hidden antialiased">
        <SiteHeader />
        <FitToScreen>{children}</FitToScreen>
      </body>
    </html>
  );
}
