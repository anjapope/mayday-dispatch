import Link from "next/link";
import { validatePublicationReadiness } from "@/application/publication-gateway/readiness";
import { actorFromRequest } from "@/application/publication-gateway/http";
import { getPublicationGatewayService } from "@/application/publication-gateway/singleton";
import { getPublicationRepository } from "@/publications/repository";
import { headers } from "next/headers";
import { EditorialControls } from "./editorial-controls";

type Props = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export default async function EditorialPublicationPage({ params }: Props) {
  const { id } = await params;
  const requestHeaders = await headers();
  const actor = await actorFromRequest(new Request("http://dispatch.internal/editorial", {
    headers: requestHeaders,
  }));
  if (!actor) {
    return <main className="shell"><h1>Editorial sign-in required</h1><p>Authenticate with a Dispatch editorial credential to view this workspace.</p></main>;
  }
  const { publication } = await getPublicationGatewayService().getPublication(id, actor);
  const repository = getPublicationRepository();
  const revisions = await repository.listRevisionHistory?.(id) ?? [];
  const lifecycleHistory = await repository.listLifecycleHistory?.(id) ?? [];
  const readiness = validatePublicationReadiness(publication);
  const assessment = publication.extensions.overwatch as
    | { assessment?: Record<string, unknown>; seriesId?: string; reportingPeriod?: string }
    | undefined;

  return (
    <main className="shell detail">
      <Link className="back-link" href="/editorial/publications">← Publication queue</Link>
      <header className="article-header">
        <p className="eyebrow">
          {publication.lifecycleState} / {publication.provenance.origin.originatingApplication}
        </p>
        <h1>{publication.title}</h1>
        {publication.subtitle && <p className="subtitle">{publication.subtitle}</p>}
        <p className="lede">{publication.excerpt}</p>
        <dl className="metadata">
          <div><dt>Version</dt><dd>v{publication.revision.version}</dd></div>
          <div><dt>Type</dt><dd>{publication.type}</dd></div>
          <div><dt>Origin project</dt><dd>{publication.provenance.origin.originatingProject}</dd></div>
          <div><dt>Stable object</dt><dd>{publication.provenance.origin.stableObjectId}</dd></div>
          <div><dt>Visibility</dt><dd>{publication.visibility}</dd></div>
          <div><dt>Created</dt><dd>{publication.provenance.createdAt}</dd></div>
          <div><dt>Last synchronized</dt><dd>{publication.revision.updatedAt}</dd></div>
        </dl>
      </header>
      <EditorialControls
        publicationId={publication.id}
        version={publication.revision.version}
        lifecycleState={publication.lifecycleState}
        title={publication.title}
        subtitle={publication.subtitle}
        excerpt={publication.excerpt}
        body={publication.body}
        tags={publication.tags}
        visibility={publication.visibility}
        sources={publication.sources}
        methodology={typeof publication.extensions.methodology === "string"
          ? publication.extensions.methodology
          : undefined}
        caveat={typeof publication.extensions.caveat === "string"
          ? publication.extensions.caveat
          : undefined}
      />
      <section className="editorial-panel" aria-labelledby="readiness-heading">
        <h2 id="readiness-heading">Readiness</h2>
        <p>{readiness.ready ? "No blocking findings." : "Publishing is blocked until errors are resolved."}</p>
        <ul>
          {readiness.findings.map((finding) => (
            <li key={finding.code}><strong>{finding.severity}</strong>: {finding.message}</li>
          ))}
        </ul>
      </section>
      {assessment?.assessment && (
        <section className="editorial-panel internal-panel" aria-labelledby="assessment-heading">
          <h2 id="assessment-heading">Internal Overwatch assessment</h2>
          <dl className="metadata">
            {Object.entries(assessment.assessment).map(([key, value]) => (
              <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd></div>
            ))}
          </dl>
        </section>
      )}
      <section className="body-copy" aria-label="Editorial content">
        {publication.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </section>
      <section className="supporting-section">
        <h2>Topics and citations</h2>
        <p>{publication.tags.join(", ") || "No topics recorded."}</p>
        <ol className="source-list">
          {publication.sources.map((source) => (
            <li key={source.id}>
              {source.url ? <a href={source.url}>{source.title}</a> : source.title}
              {" — "}{source.authors.join(", ")}
            </li>
          ))}
        </ol>
      </section>
      <section className="supporting-section">
        <h2>Evidence and citations</h2>
        <p>{publication.evidence.length} evidence references, {publication.sources.length} citations.</p>
        <ul className="evidence-list">
          {publication.evidence.map((evidence) => (
            <li key={evidence.id}>
              <strong>{evidence.title}</strong> — <strong>{evidence.visibility}</strong>
              <dl className="metadata">
                <div><dt>Evidence ID</dt><dd>{evidence.id}</dd></div>
                <div><dt>Version</dt><dd>v{evidence.evidenceVersion ?? 1}</dd></div>
                <div><dt>Media type</dt><dd>{evidence.mediaType ?? "unspecified"}</dd></div>
                <div><dt>Source</dt><dd>{evidence.source ?? "unspecified"}</dd></div>
                <div><dt>Processor</dt><dd>{evidence.processor ?? "unspecified"}</dd></div>
                <div><dt>Processing state</dt><dd>{evidence.status ?? "unspecified"}</dd></div>
                <div><dt>Acquired</dt><dd>{evidence.acquisitionAt ?? "unspecified"}</dd></div>
                <div><dt>Processed</dt><dd>{evidence.processedAt ?? "unspecified"}</dd></div>
                <div><dt>Checksum algorithm</dt><dd>{evidence.checksumAlgorithm ?? "unspecified"}</dd></div>
                <div><dt>Parent evidence</dt><dd>{evidence.parentEvidenceId ?? "none"}</dd></div>
                <div><dt>Derivation</dt><dd>{evidence.derivationType ?? "original"}</dd></div>
                <div><dt>Provenance</dt><dd>{evidence.evidenceProvenance ?? "unspecified"}</dd></div>
              </dl>
              {evidence.citation && <p>{evidence.citation.title}</p>}
              {evidence.visibility === "public" && evidence.url && <a href={evidence.url}>Public URL</a>}
            </li>
          ))}
        </ul>
      </section>
      <section className="supporting-section">
        <h2>Public preview</h2>
        <p>The public route uses the same projection as the preview API and excludes internal assessment metadata.</p>
        <Link href={`/editorial/publications/${publication.id}/preview`}>Open visual public preview</Link>
        {publication.visibility === "public" && <Link href={`/publications/${publication.slug}`}>Open public projection</Link>}
      </section>
      <section className="supporting-section">
        <h2>Revision history</h2>
        <ol className="source-list">
          {revisions.map((revision) => (
            <li key={revision.version}>
              v{revision.version} ({revision.revisionType}) — {revision.summary} by {revision.actorSubject ?? "unknown"} at {revision.updatedAt}
            </li>
          ))}
        </ol>
      </section>
      <section className="supporting-section">
        <h2>Lifecycle history</h2>
        <ol className="source-list">
          {lifecycleHistory.map((entry) => (
            <li key={entry.version}>
              {entry.fromState ?? "intake"} → {entry.toState} at v{entry.version} ({entry.changedAt})
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
