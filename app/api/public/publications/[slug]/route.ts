import {
  gatewayErrorResponse,
  jsonResponse,
  publicReaderActor,
} from "@/application/publication-gateway/http";
import { getPublicationGatewayService } from "@/application/publication-gateway/singleton";

type PublicPublicationRouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: PublicPublicationRouteContext) {
  try {
    const { slug } = await params;

    return jsonResponse(
      await getPublicationGatewayService().getPublicBySlug(slug, publicReaderActor()),
    );
  } catch (error) {
    return gatewayErrorResponse(error);
  }
}
