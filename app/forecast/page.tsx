import type { Metadata } from "next";
import { PublicSectionPage } from "../section-page";
export const metadata: Metadata = { title: "Forecast | Mayday Dispatch", description: "Forward-looking, evidence-grounded public analysis." };
export default function ForecastPage() { return <PublicSectionPage section="forecast" />; }
