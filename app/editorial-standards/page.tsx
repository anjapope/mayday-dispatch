import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Editorial standards | Mayday Dispatch",
  description: "Public sourcing, uncertainty, correction, and release standards.",
};

export default function EditorialStandardsPage() {
  return (
    <main className="shell detail">
      <header className="masthead">
        <p className="eyebrow">Editorial standards</p>
        <h1>Evidence, independence, and accountability</h1>
        <p className="lede">
          Public material is selected and released through human editorial review.
        </p>
      </header>
      <section className="body-copy">
        <h2>Source and evidence review</h2>
        <p>
          Editors assess whether sources support the claims made, consider
          corroboration and conflicting evidence, and review source limits,
          rights, attribution, privacy, and potential harm. A citation alone
          does not establish a claim. Internally available material is not
          automatically suitable for public disclosure.
        </p>
        <h2>Observation, inference, and uncertainty</h2>
        <p>
          Reporting distinguishes direct observation and attributed claims from
          interpretation. Analysis states material assumptions and limits.
          Forecasts describe conditional scenarios, indicators, and uncertainty;
          they are not presented as certain outcomes.
        </p>
        <h2>Corrections and updates</h2>
        <p>
          A material correction is labeled and accompanied by an editorial
          note. Substantive new analysis is identified as an update. Revised
          content remains staged until it has been reviewed and a publisher has
          explicitly authorized a new release; prior public content is not
          silently replaced.
        </p>
        <h2>Release and withdrawal</h2>
        <p>
          Drafting, analysis, readiness, and public release are separate
          activities. Research and processing systems cannot publish on their
          own. A configured human publisher authorizes each exact revision.
          Published work may be archived following editorial review.
        </p>
        <p>
          This public summary does not replace the{" "}
          <Link href="/methodology">methodology page</Link> or the full policy and
          applicable legal review.
        </p>
      </section>
    </main>
  );
}
