import {
  actorFromRequest,
  gatewayErrorResponse,
  jsonResponse,
  requestContextFromRequest,
} from "@/application/publication-gateway/http";
import { getPublicationGatewayService } from "@/application/publication-gateway/singleton";
import { validatePublicationReadiness } from "@/application/publication-gateway/readiness";

export async function GET(request: Request) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await actorFromRequest(request);
    const response = await getPublicationGatewayService().list(actor);
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const application = url.searchParams.get("application");
    const type = url.searchParams.get("type");
    const visibility = url.searchParams.get("visibility");
    const project = url.searchParams.get("project");
    const readiness = url.searchParams.get("readiness");
    const updatedAfter = url.searchParams.get("updatedAfter");
    const updatedBefore = url.searchParams.get("updatedBefore");
    return jsonResponse({
      publications: response.publications.filter((publication) =>
        (!state || publication.lifecycleState === state) &&
        (!application || publication.provenance.origin.originatingApplication === application) &&
        (!type || publication.type === type) &&
        (!visibility || publication.visibility === visibility) &&
        (!project || publication.provenance.origin.originatingProject === project) &&
        (!readiness || (readiness === "ready") === validatePublicationReadiness(publication).ready) &&
        (!updatedAfter || publication.revision.updatedAt >= updatedAfter) &&
        (!updatedBefore || publication.revision.updatedAt <= updatedBefore),
      ),
    }, 200, context);
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}
