import Link from "next/link";
import { headers } from "next/headers";
import { actorFromRequest } from "@/application/publication-gateway/http";
import { getPublicationGatewayService } from "@/application/publication-gateway/singleton";

export const dynamic = "force-dynamic";
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function value(params: Record<string, string | string[] | undefined>, key: string): string {
  const candidate = params[key];
  return typeof candidate === "string" ? candidate : "";
}

export default async function EditorialPublicationsPage({ searchParams }: Props) {
  const requestHeaders = await headers();
  const actor = await actorFromRequest(new Request("http://dispatch.internal/editorial", {
    headers: requestHeaders,
  }));
  if (!actor) {
    return <main className="shell"><h1>Editorial sign-in required</h1><p>Authenticate with a Dispatch editorial credential to view this workspace.</p></main>;
  }
  const { publications } = await getPublicationGatewayService().list(actor);
  const params = await searchParams;
  const state = value(params, "state");
  const application = value(params, "application");
  const type = value(params, "type");
  const visibility = value(params, "visibility");
  const project = value(params, "project");
  const filtered = publications.filter((publication) =>
    (!state || publication.lifecycleState === state) &&
    (!application || publication.provenance.origin.originatingApplication === application) &&
    (!type || publication.type === type) &&
    (!visibility || publication.visibility === visibility) &&
    (!project || publication.provenance.origin.originatingProject === project),
  );
  const applications = [...new Set(publications.map((publication) =>
    publication.provenance.origin.originatingApplication,
  ))].sort();
  const types = [...new Set(publications.map((publication) => publication.type))].sort();
  const visibilities = [...new Set(publications.map((publication) => publication.visibility))].sort();
  const projects = [...new Set(publications.map((publication) =>
    publication.provenance.origin.originatingProject,
  ))].sort();
  return (
    <main className="shell">
      <Link className="back-link" href="/editorial">← Editorial workspace</Link>
      <header className="masthead">
        <p className="eyebrow">Dispatch / Intake</p>
        <h1>Publication queue</h1>
        <p className="lede">Items remain under editorial control until an authorized publisher makes them public.</p>
      </header>
      <form className="filter-form" method="get">
        <label>Lifecycle<select name="state" defaultValue={state}><option value="">All</option>{["draft", "review", "ready", "published", "updated", "archived"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Origin<select name="application" defaultValue={application}><option value="">All</option>{applications.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Type<select name="type" defaultValue={type}><option value="">All</option>{types.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Visibility<select name="visibility" defaultValue={visibility}><option value="">All</option>{visibilities.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Project<select name="project" defaultValue={project}><option value="">All</option>{projects.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button type="submit">Filter queue</button>
      </form>
      <div className="publication-grid">
        {filtered.map((publication) => (
          <article className="publication-card" key={publication.id}>
            <p className="card-meta">
              {publication.lifecycleState} / {publication.provenance.origin.originatingApplication}
            </p>
            <h2><Link href={`/editorial/publications/${publication.id}`}>{publication.title}</Link></h2>
            <p>{publication.excerpt}</p>
            <footer>
              <span>{publication.type}</span>
              <span>{publication.visibility}</span>
              <span>v{publication.revision.version}</span>
              <span>{publication.evidence.length} evidence item{publication.evidence.length === 1 ? "" : "s"}</span>
              <span>{publication.revision.updatedAt.slice(0, 10)}</span>
            </footer>
          </article>
        ))}
      </div>
    </main>
  );
}
