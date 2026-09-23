import { z } from "zod";
import { CitationSchema, EvidenceVisibilitySchema } from "@/domain/publication";

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
    processor: z.string().trim().min(1).optional(),
    status: z.enum(["registered", "processing", "ready", "rejected"]),
    publicUrl: z.string().url().optional(),
    locator: z.string().trim().min(1).optional(),
    citation: CitationSchema.optional(),
    registeredAt: z.string().datetime({ offset: true }),
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
  });

export type RegisteredEvidence = z.infer<typeof RegisteredEvidenceSchema>;

export interface EvidenceRegistry {
  getRegisteredEvidence(id: string): Promise<RegisteredEvidence | undefined>;
  register(evidence: RegisteredEvidence): Promise<RegisteredEvidence>;
}

export class InMemoryEvidenceRegistry implements EvidenceRegistry {
  private readonly evidence = new Map<string, RegisteredEvidence>();

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

  async register(evidence: RegisteredEvidence): Promise<RegisteredEvidence> {
    const registered = RegisteredEvidenceSchema.parse(evidence);
    this.evidence.set(registered.id, structuredClone(registered));
    return structuredClone(registered);
  }
}
