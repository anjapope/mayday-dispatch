import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default function EditorialLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
