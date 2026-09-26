import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Services | Mayday Dispatch", description: "Commissioned research, monitoring, and evidence-organization work." };
const services = [
  ["Research and evidence synthesis", "Structured research, source review, and concise findings for defined questions."],
  ["Monitoring and analytical reporting", "OSINT monitoring and recurring reports with stated sources, caveats, and update paths."],
  ["Evidence and collection organization", "Provenance-aware organization of digital collections, research records, and source material."],
  ["Archival and digital-humanities support", "Research support for archival materials, cataloging, and structured information work."],
];
export default function ServicesPage() { return <main className="shell services-page"><header className="masthead"><h1>Services</h1><p className="lede">Commissioned research and information work for organizations with concrete questions.</p></header><div className="services-list">{services.map(([title, description]) => <section key={title}><h2>{title}</h2><p>{description}</p></section>)}</div><section className="supporting-section"><h2>Starting a conversation</h2><p>Describe the question, material, or reporting need, the intended audience, and any timing constraints.</p><Link href="/contact">Contact Mayday Dispatch</Link></section></main>; }
