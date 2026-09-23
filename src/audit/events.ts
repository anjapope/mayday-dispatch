import { z } from "zod";

export const AuditEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }),
  actor: z.object({
    subjectId: z.string().min(1),
    roles: z.array(z.string().min(1)),
    application: z.string().min(1).optional(),
  }),
  action: z.string().min(1),
  publicationId: z.string().uuid().optional(),
  correlationId: z.string().min(1),
  requestId: z.string().min(1),
  previousVersion: z.number().int().positive().optional(),
  resultingVersion: z.number().int().positive().optional(),
  outcome: z.enum(["succeeded", "rejected", "failed"]),
  reason: z.string().min(1).optional(),
  errorCode: z.string().min(1).optional(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;
