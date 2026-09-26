import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PublicSiteShell } from "./public-site-shell";

export const metadata: Metadata = {
  title: "The Golden Horn",
  description: "Research, evidence, and intelligence from the Mayday system.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><PublicSiteShell>{children}</PublicSiteShell></body>
    </html>
  );
}
