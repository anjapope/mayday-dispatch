import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy | Mayday Dispatch",
  description: "Known data practices and privacy questions for Mayday Dispatch.",
};

export default function PrivacyPage() {
  return (
    <main className="shell detail">
      <header className="masthead">
        <p className="eyebrow">Privacy</p>
        <h1>Privacy information</h1>
      </header>
      <section className="body-copy">
        <p>This site has no public contact form, account registration, mailing list, or third-party analytics integration. The editorial workspace uses an eight-hour, HttpOnly session cookie only for authenticated editorial access; it is not required to read public pages.</p>
        <p>The application writes operational security events that can include event time, request and correlation identifiers, configured service identity, result, duration, and stable error code. It does not intentionally log request bodies, source material, credentials, or visitor IP addresses. A future hosting provider or reverse proxy may separately process connection and access-log data; that environment and its retention have not been selected or verified.</p>
        <p>Editorial records, acquired evidence, client-provided material, and proprietary analysis are stored separately from public page projections. The application does not set a data-retention schedule or automatically delete those records or backups. Before public operation, the service owner must document retention, access, backup disposal, hosting, and any applicable legal requirements.</p>
        <p>Public articles can link to or display editor-approved resources hosted by third parties. Those hosts may receive a request from a reader's device when a link or image is opened or rendered. External analytics services are not configured.</p>
        <p>No verified privacy contact channel has been configured. The Contact page does not accept or deliver inquiries. This notice describes the current application code and is not a substitute for review against the actual hosting environment and applicable law.</p>
      </section>
    </main>
  );
}
