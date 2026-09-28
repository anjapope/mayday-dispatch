import { PublicationGatewayService } from "@/application/publication-gateway/service";
import { getPublicationRepository } from "@/publications/repository";

let gatewayService: PublicationGatewayService | undefined;

export function getPublicationGatewayService(): PublicationGatewayService {
  gatewayService ??= new PublicationGatewayService({
    repository: getPublicationRepository(),
  });
  return gatewayService;
}
