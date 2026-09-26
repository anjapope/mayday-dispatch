import Link from "next/link";
import { headers } from "next/headers";
import { actorFromRequest } from "@/application/publication-gateway/http";
import { getEvidenceGatewayService } from "@/application/evidence-gateway/singleton";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = "force-dynamic";

export default async function EditorialEvidencePage({ searchParams }: Props) {
  const actor = await actorFromRequest(new Request("http://dispatch.internal/editorial/evidence", {
    headers: await headers(),
  }));
  if (!actor) return <main className="shell"><h1>Editorial sign-in required</h1></main>;
  const params = await searchParams;
  const query = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string")) as Record<string, string>;
  const result = await getEvidenceGatewayService().search(actor, { ...query, limit: query.limit ?? "20" });
  return (
    <main className="shell">
      <Link className="back-link" href="/editorial">← Editorial workspace</Link>
      <header className="masthead"><p className="eyebrow">Dispatch / Evidence Registry</p><h1>Evidence Library</h1><p className="lede">Search registered metadata and reuse stable evidence identities.</p></header>
      <form className="filter-form" method="get">
        <label>Text query<input name="query" defaultValue={query.query} /></label>
        <label>Media type<input name="mediaType" defaultValue={query.mediaType} /></label>
        <label>Processing state<select name="processingState" defaultValue={query.processingState}><option value="">All</option>{["registered", "processing", "ready", "failed", "rejected", "superseded"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Visibility<select name="visibility" defaultValue={query.visibility}><option value="">All</option>{["public", "citation-only", "internal", "private"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Collection<input name="collectionId" defaultValue={query.collectionId} /></label>
        <button type="submit">Search evidence</button>
      </form>
      <div className="publication-grid">
        {result.evidence.map((evidence) => <article className="publication-card" key={evidence.id}>
          <p className="card-meta">{evidence.status} / {evidence.visibility}</p>
          <h2><Link href={`/editorial/evidence/${evidence.id}`}>{evidence.title}</Link></h2>
          <p>{evidence.source} · {evidence.mediaType}</p>
          <footer><span>v{evidence.version}</span><span>{evidence.processor ?? "no processor"}</span></footer>
        </article>)}
      </div>
    </main>
  );
}
