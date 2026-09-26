import { actorFromRequest, gatewayErrorResponse, jsonResponse, requestContextFromRequest } from "@/application/publication-gateway/http";
import { getPublicationGatewayService } from "@/application/publication-gateway/singleton";
import { toPublicPublication } from "@/domain/publication";
import { GatewayError } from "@/application/publication-gateway/errors";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await actorFromRequest(request);
    const { id } = await params;
    const response = await getPublicationGatewayService().getPublication(id, actor, context);
    if (response.publication.visibility !== "public") {
      throw new GatewayError("FORBIDDEN", "A public preview requires public visibility.");
    }
    return jsonResponse({ publication: toPublicPublication(response.publication) }, 200, context);
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}
