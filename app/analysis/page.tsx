import type { Metadata } from "next";
import { PublicSectionPage } from "../section-page";
export const metadata: Metadata = { title: "Analysis | Mayday Dispatch", description: "Public research and analytical writing." };
export default function AnalysisPage() { return <PublicSectionPage section="analysis" />; }
