import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PublicSiteShell } from "./public-site-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mayday Dispatch",
  description: "Public research, analysis, monitoring, and forecasts from Mayday Dispatch.",
  openGraph: {
    type: "website",
    siteName: "Mayday Dispatch",
    title: "Mayday Dispatch",
    description: "Public research, analysis, monitoring, and forecasts from Mayday Dispatch.",
  },
  ...(process.env.MAYDAY_PUBLIC_BASE_URL
    ? { metadataBase: new URL(process.env.MAYDAY_PUBLIC_BASE_URL) }
    : {}),
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><PublicSiteShell>{children}</PublicSiteShell></body>
    </html>
  );
}
