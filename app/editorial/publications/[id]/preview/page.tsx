import Link from "next/link";
import { headers } from "next/headers";
import { actorFromRequest } from "@/application/publication-gateway/http";
import { getPublicationGatewayService } from "@/application/publication-gateway/singleton";
import { toPublicPublication } from "@/domain/publication";
import { PublicationArticle } from "../../../../publications/publication-article";

type Props = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export default async function EditorialPublicationPreviewPage({ params }: Props) {
  const { id } = await params;
  const requestHeaders = await headers();
  const actor = await actorFromRequest(new Request("http://dispatch.internal/editorial/preview", {
    headers: requestHeaders,
  }));
  if (!actor) {
    return <main className="shell"><h1>Editorial sign-in required</h1></main>;
  }
  const { publication } = await getPublicationGatewayService().getPublication(id, actor);
  if (publication.visibility !== "public") {
    return <main className="shell"><h1>Public preview unavailable</h1><p>Set the publication visibility to public before previewing it.</p></main>;
  }
  return (
    <main className="shell detail">
      <Link className="back-link" href={`/editorial/publications/${id}`}>← Back to editorial review</Link>
      <p className="eyebrow">Editorial public preview</p>
      <PublicationArticle publication={toPublicPublication(publication)} />
    </main>
  );
}
