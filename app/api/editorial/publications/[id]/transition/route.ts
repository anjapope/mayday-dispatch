import {
  actorFromRequest,
  gatewayErrorResponse,
  jsonResponse,
  readJsonBody,
  requestContextFromRequest,
} from "@/application/publication-gateway/http";
import { getPublicationGatewayService } from "@/application/publication-gateway/singleton";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await actorFromRequest(request);
    const { id } = await params;
    return jsonResponse(await getPublicationGatewayService().transition(id, await readJsonBody(request), actor, context), 200, context);
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}
