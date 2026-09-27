import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl } from "@/publications/metadata";
export const metadata: Metadata = {
  title: "Services | Mayday Dispatch",
  description: "Commissioned research, monitoring, and evidence-organization work.",
  alternates: { canonical: canonicalUrl("/services") },
};
const services = [
  ["Research and evidence synthesis", "Structured research, source review, and concise findings for defined questions."],
  ["Monitoring and analytical reporting", "OSINT monitoring and recurring reports with stated sources, caveats, and update paths."],
  ["Evidence and collection organization", "Provenance-aware organization of digital collections, research records, and source material."],
  ["Archival and digital-humanities support", "Research support for archival materials, cataloging, and structured information work."],
];
export default function ServicesPage() { return <main className="shell services-page"><header className="masthead"><h1>Services</h1><p className="lede">Information about potential research and information work.</p></header><div className="services-list">{services.map(([title, description]) => <section key={title}><h2>{title}</h2><p>{description}</p></section>)}</div><section className="supporting-section"><h2>Service inquiries</h2><p>No verified inquiry channel, intake, engagement terms, or delivery workflow is currently configured. This page is informational only and does not accept commissions or submissions.</p><Link href="/contact">Contact information</Link></section></main>; }
