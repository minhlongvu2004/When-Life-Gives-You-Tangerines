import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "When Life Gives You Tangerines",
  description:
    "A financial resilience engine: know the customer, take a shock, make a plan. Sheridan Datathon 2026 — Tangerine track.",
  icons: { icon: "/tangerine.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SiteHeader />
        <main className="mx-auto max-w-[1280px] px-4 pb-16 sm:px-6">{children}</main>
        <footer className="mx-auto max-w-[1280px] px-4 pb-10 text-xs text-muted sm:px-6">
          Data: PKDD&apos;99 Discovery Challenge Financial dataset (CTU Prague Relational Dataset Repository), anonymized
          real bank data, amounts in CAD. EI rules: Government of Canada (2026: 55% up to $729/week). Built for the
          Sheridan Datathon 2026, Tangerine track “Resilience Rewired”.
        </footer>
      </body>
    </html>
  );
}
