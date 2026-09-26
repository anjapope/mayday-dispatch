import { z } from "zod";
import { CitationSchema, EvidenceVisibilitySchema } from "@/domain/publication";
import {
  EvidenceProcessingStatusSchema,
  RegisteredEvidenceSchema,
} from "@/evidence/registry";

/**
 * Registration request DTO for `POST /api/evidence`. This is the
 * Mayday3-compatible contract: Mayday3 (or another owning system) performs
 * acquisition, checksum calculation, and content processing, then registers
 * the resulting metadata here. `registeredAt` is optional on the wire; the
 * gateway stamps it when omitted. Registration is deliberately independent
 * of publication association: nothing here creates or edits a publication.
 *
 * This mirrors `RegisteredEvidenceSchema`'s shape but makes `registeredAt`
 * optional. `RegisteredEvidenceSchema` applies a `superRefine`
 * cross-field check (visibility vs. publicUrl/citation), so it is not
 * reused directly here (a `ZodEffects` cannot be built with `.omit()`);
 * that same cross-field check is still enforced downstream when the
 * registry ultimately calls `RegisteredEvidenceSchema.parse(...)`.
 */
export const RegisterEvidenceRequestSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    mediaType: z.string().trim().min(1),
    source: z.string().trim().min(1),
    provenance: z.string().trim().min(1),
    visibility: EvidenceVisibilitySchema,
    checksum: z.string().regex(/^[a-fA-F0-9]{64}$/, "Use a SHA-256 checksum."),
    checksumAlgorithm: z.literal("sha256").default("sha256"),
    processor: z.string().trim().min(1).optional(),
    status: EvidenceProcessingStatusSchema,
    publicUrl: z.string().url().optional(),
    sourceUrl: z.string().url().optional(),
    locator: z.string().trim().min(1).optional(),
    citation: CitationSchema.optional(),
    registeredAt: z.string().datetime({ offset: true }).optional(),
    acquisitionAt: z.string().datetime({ offset: true }).optional(),
    processedAt: z.string().datetime({ offset: true }).optional(),
    originalFilename: z.string().trim().min(1).refine(
      (value) => !/[\\/]/.test(value),
      "Original filenames must not contain filesystem paths.",
    ).optional(),
    collectionId: z.string().trim().min(1).optional(),
    originalIdentifier: z.string().trim().min(1).optional(),
    acquisitionMethod: z.string().trim().min(1).optional(),
    provenanceNote: z.string().trim().min(1).optional(),
    parentEvidenceId: z.string().uuid().optional(),
    derivationType: z.string().trim().min(1).optional(),
    supersededBy: z.string().uuid().optional(),
    processingError: z.string().trim().min(1).optional(),
  })
  .strict();

export type RegisterEvidenceRequest = z.infer<typeof RegisterEvidenceRequestSchema>;

export const UpdateEvidenceRequestSchema = RegisterEvidenceRequestSchema
  .omit({ id: true, registeredAt: true })
  .partial()
  .extend({
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .refine(
    (request) => Object.keys(request).some((key) => key !== "expectedVersion"),
    "At least one evidence field must be provided.",
  );

export type UpdateEvidenceRequest = z.infer<typeof UpdateEvidenceRequestSchema>;

export const EvidenceGatewayResponseSchema = z
  .object({
    evidence: RegisteredEvidenceSchema,
    correlationId: z.string().min(1),
  })
  .strict();

export type EvidenceGatewayResponse = z.infer<typeof EvidenceGatewayResponseSchema>;