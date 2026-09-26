import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy | The Golden Horn",
  description: "Privacy information for The Golden Horn.",
};

export default function PrivacyPage() {
  return (
    <main className="shell detail">
      <header className="masthead">
        <p className="eyebrow">Privacy</p>
        <h1>Privacy information</h1>
      </header>
      <section className="body-copy">
        <p>Privacy notices for The Golden Horn will be published here as public-site data practices are established.</p>
        <p>For a privacy inquiry, please <Link href="/contact">contact Mayday Information Systems</Link>.</p>
      </section>
    </main>
  );
}
