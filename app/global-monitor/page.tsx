import type { Metadata } from "next";
import { canonicalUrl } from "@/publications/metadata";
import { PublicSectionPage } from "../section-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Global Monitor | Mayday Dispatch",
  description: "Current public reports and monitoring dispatches.",
  alternates: { canonical: canonicalUrl("/global-monitor") },
};
export default function GlobalMonitorPage() { return <PublicSectionPage section="global-monitor" />; }
