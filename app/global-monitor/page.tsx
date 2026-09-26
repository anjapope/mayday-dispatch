import type { Metadata } from "next";
import { PublicSectionPage } from "../section-page";
export const metadata: Metadata = { title: "Global Monitor | Mayday Dispatch", description: "Current public reports and monitoring dispatches." };
export default function GlobalMonitorPage() { return <PublicSectionPage section="global-monitor" />; }
