import Link from "next/link";
import { headers } from "next/headers";
import { actorFromRequest } from "@/application/publication-gateway/http";
import { getEvidenceGatewayService } from "@/application/evidence-gateway/singleton";

export const dynamic = "force-dynamic";
export default async function EditorialEvidenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await actorFromRequest(new Request("http://dispatch.internal/editorial/evidence", { headers: await headers() }));
  if (!actor) return <main className="shell"><h1>Editorial sign-in required</h1></main>;
  const detail = await getEvidenceGatewayService().retrieveDetail(actor, (await params).id);
  const { evidence } = detail;
  return <main className="shell detail"><Link className="back-link" href="/editorial/evidence">← Evidence Library</Link>
    <header className="article-header"><p className="eyebrow">{evidence.status} / {evidence.visibility}</p><h1>{evidence.title}</h1>
      <dl className="metadata"><div><dt>Evidence ID</dt><dd>{evidence.id}</dd></div><div><dt>Version</dt><dd>v{evidence.version}</dd></div><div><dt>Media type</dt><dd>{evidence.mediaType}</dd></div><div><dt>Processor</dt><dd>{evidence.processor ?? "unspecified"}</dd></div></dl>
    </header>
    <section className="supporting-section"><h2>Provenance and integrity</h2><dl className="metadata"><div><dt>Source</dt><dd>{evidence.source}</dd></div><div><dt>Collection</dt><dd>{evidence.collectionId ?? "unspecified"}</dd></div><div><dt>Original ID</dt><dd>{evidence.originalIdentifier ?? "unspecified"}</dd></div><div><dt>Acquired</dt><dd>{evidence.acquisitionAt ?? "unspecified"}</dd></div><div><dt>Processed</dt><dd>{evidence.processedAt ?? "unspecified"}</dd></div><div><dt>Checksum algorithm</dt><dd>{evidence.checksumAlgorithm}</dd></div></dl><p>{evidence.provenanceNote ?? evidence.provenance}</p></section>
    <section className="supporting-section"><h2>Lineage</h2><p>Parent: {evidence.parentEvidenceId ? <Link href={`/editorial/evidence/${evidence.parentEvidenceId}`}>{evidence.parentEvidenceId}</Link> : "original evidence"}</p><p>Derivation: {evidence.derivationType ?? "none"}</p></section>
    <section className="supporting-section"><h2>Related evidence</h2><ul>{detail.relatedEvidence.map((item) => <li key={`${item.relationship}-${item.evidenceId}`}><Link href={`/editorial/evidence/${item.evidenceId}`}>{item.evidenceId}</Link> — {item.relationship}</li>)}</ul></section>
    <section className="supporting-section"><h2>Possible duplicates</h2><ul>{detail.possibleDuplicates.map((item) => <li key={item.evidenceId}><Link href={`/editorial/evidence/${item.evidenceId}`}>{item.evidenceId}</Link> — {item.reason}</li>)}</ul></section>
    <section className="supporting-section"><h2>Publication usage</h2><ul>{detail.publicationUses.map((item) => <li key={item.publicationId}><Link href={`/editorial/publications/${item.publicationId}`}>{item.title}</Link> — {item.publicationType}, {item.lifecycleState}</li>)}</ul></section>
    <section className="supporting-section"><h2>History</h2><p>{detail.revisionHistory.length} recorded revisions and {detail.auditHistory.length} recent audit events.</p></section>
  </main>;
}
