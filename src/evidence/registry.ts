import { z } from "zod";
import { CitationSchema, EvidenceVisibilitySchema } from "@/domain/publication";

export const EvidenceProcessingStatusSchema = z.enum([
  "registered",
  "processing",
  "ready",
  "failed",
  "rejected",
  "superseded",
]);

const SafeFilenameSchema = z.string().trim().min(1).refine(
  (value) => !/[\\/]/.test(value),
  "Original filenames must not contain filesystem paths.",
);

export const RegisteredEvidenceSchema = z
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
    registeredAt: z.string().datetime({ offset: true }),
    version: z.number().int().positive().default(1),
    acquisitionAt: z.string().datetime({ offset: true }).optional(),
    processedAt: z.string().datetime({ offset: true }).optional(),
    originalFilename: SafeFilenameSchema.optional(),
    collectionId: z.string().trim().min(1).optional(),
    originalIdentifier: z.string().trim().min(1).optional(),
    acquisitionMethod: z.string().trim().min(1).optional(),
    provenanceNote: z.string().trim().min(1).optional(),
    parentEvidenceId: z.string().uuid().optional(),
    derivationType: z.string().trim().min(1).optional(),
    supersededBy: z.string().uuid().optional(),
    processingError: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.visibility === "public" && !evidence.publicUrl && !evidence.citation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicUrl"],
        message: "Public evidence requires publicUrl or citation metadata.",
      });
    }
    if (evidence.visibility === "citation-only" && !evidence.citation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["citation"],
        message: "Citation-only evidence requires citation metadata.",
      });
    }
    if (evidence.parentEvidenceId === evidence.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["parentEvidenceId"],
        message: "Evidence cannot be its own parent.",
      });
    }
    if (evidence.supersededBy === evidence.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supersededBy"],
        message: "Evidence cannot supersede itself.",
      });
    }
  });

export type RegisteredEvidence = z.infer<typeof RegisteredEvidenceSchema>;

export type EvidenceAuditEvent = {
  id: string;
  timestamp: string;
  actorSubject: string;
  actorApplication?: string;
  action: string;
  evidenceId: string;
  previousVersion?: number;
  resultingVersion?: number;
  outcome: "succeeded" | "rejected" | "failed";
  correlationId: string;
  requestId: string;
  errorCode?: string;
};

export type EvidenceSaveOptions = {
  audit?: EvidenceAuditEvent;
  idempotency?: {
    actorScope: string;
    key: string;
    requestHash: string;
    createdAt: string;
  };
};

export interface EvidenceRegistry {
  getRegisteredEvidence(id: string): Promise<RegisteredEvidence | undefined>;
  register(evidence: RegisteredEvidence, options?: EvidenceSaveOptions): Promise<RegisteredEvidence>;
  updateEvidence?(
    evidence: RegisteredEvidence,
    expectedVersion: number,
    options?: EvidenceSaveOptions,
  ): Promise<RegisteredEvidence>;
  findEvidenceIdempotency?(
    actorScope: string,
    key: string,
  ): Promise<RegisteredEvidence | undefined>;
  listEvidenceHistory?(id: string): Promise<RegisteredEvidence[]>;
}

export class InMemoryEvidenceRegistry implements EvidenceRegistry {
  private readonly evidence = new Map<string, RegisteredEvidence>();
  private readonly idempotency = new Map<string, RegisteredEvidence>();

  constructor(items: readonly RegisteredEvidence[] = []) {
    for (const item of items) {
      const registered = RegisteredEvidenceSchema.parse(item);
      this.evidence.set(registered.id, structuredClone(registered));
    }
  }

  async getRegisteredEvidence(id: string): Promise<RegisteredEvidence | undefined> {
    const evidence = this.evidence.get(id);
    return evidence ? structuredClone(evidence) : undefined;
  }

  async register(evidence: RegisteredEvidence, options?: EvidenceSaveOptions): Promise<RegisteredEvidence> {
    const registered = RegisteredEvidenceSchema.parse(evidence);
    if (this.evidence.has(registered.id)) {
      throw new Error("Evidence identity already exists.");
    }
    this.evidence.set(registered.id, structuredClone(registered));
    if (options?.idempotency) {
      this.idempotency.set(
        `${options.idempotency.actorScope}:${options.idempotency.key}`,
        structuredClone(registered),
      );
    }
    return structuredClone(registered);
  }

  async updateEvidence(
    evidence: RegisteredEvidence,
    expectedVersion: number,
    options?: EvidenceSaveOptions,
  ): Promise<RegisteredEvidence> {
    void options;
    const existing = this.evidence.get(evidence.id);
    if (!existing || existing.version !== expectedVersion) {
      throw new Error("Evidence version does not match the persisted version.");
    }
    const updated = RegisteredEvidenceSchema.parse(evidence);
    this.evidence.set(updated.id, structuredClone(updated));
    return structuredClone(updated);
  }

  async findEvidenceIdempotency(actorScope: string, key: string): Promise<RegisteredEvidence | undefined> {
    const evidence = this.idempotency.get(`${actorScope}:${key}`);
    return evidence ? structuredClone(evidence) : undefined;
  }
}
