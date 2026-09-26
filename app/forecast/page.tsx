import type { Metadata } from "next";
import { canonicalUrl } from "@/publications/metadata";
import { PublicSectionPage } from "../section-page";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Forecast | Mayday Dispatch",
  description: "Forward-looking, evidence-grounded public analysis.",
  alternates: { canonical: canonicalUrl("/forecast") },
};
export default function ForecastPage() { return <PublicSectionPage section="forecast" />; }
