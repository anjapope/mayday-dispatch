import type { Metadata } from "next";
import { canonicalUrl } from "@/publications/metadata";
import { PublicSectionPage } from "../section-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Analysis | Mayday Dispatch",
  description: "Public research and analytical writing.",
  alternates: { canonical: canonicalUrl("/analysis") },
};
export default function AnalysisPage() { return <PublicSectionPage section="analysis" />; }
