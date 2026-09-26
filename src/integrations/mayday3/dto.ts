import { z } from "zod";
import {
  EvidenceGatewayResponseSchema,
  RegisterEvidenceRequestSchema,
  UpdateEvidenceRequestSchema,
} from "@/application/evidence-gateway/dto";

export const Mayday3EvidenceRegistrationSchema = RegisterEvidenceRequestSchema;
export const Mayday3EvidenceUpdateSchema = UpdateEvidenceRequestSchema;
export type Mayday3EvidenceRegistration = z.infer<typeof Mayday3EvidenceRegistrationSchema>;
export type Mayday3EvidenceUpdate = z.infer<typeof Mayday3EvidenceUpdateSchema>;
export type Mayday3EvidenceResponse = z.infer<typeof EvidenceGatewayResponseSchema>;
