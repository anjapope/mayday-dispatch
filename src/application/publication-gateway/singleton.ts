import { PublicationGatewayService } from "@/application/publication-gateway/service";
import { getPublicationRepository } from "@/publications/repository";

const gatewayService = new PublicationGatewayService({
  repository: getPublicationRepository(),
});

export function getPublicationGatewayService(): PublicationGatewayService {
  return gatewayService;
}
