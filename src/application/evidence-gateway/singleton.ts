import { EvidenceGatewayService } from "@/application/evidence-gateway/service";
import { getPublicationRepository } from "@/publications/repository";
import type { EvidenceRegistry } from "@/evidence/registry";

let evidenceGatewayService: EvidenceGatewayService | undefined;

export function getEvidenceGatewayService(): EvidenceGatewayService {
  evidenceGatewayService ??= new EvidenceGatewayService({
    // `SqlitePublicationRepository` (the only production repository
    // implementation) implements both `PublicationRepository` and
    // `EvidenceRegistry`; this reuses the same singleton connection rather
    // than opening a second database handle.
    registry: getPublicationRepository() as unknown as EvidenceRegistry,
  });
  return evidenceGatewayService;
}