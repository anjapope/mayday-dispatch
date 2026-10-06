import { NextResponse } from "next/server";
import { z } from "zod";
import { GatewayError } from "@/application/publication-gateway/errors";
import { actorFromRequest, gatewayErrorResponse, readJsonBody, requestContextFromRequest } from "@/application/publication-gateway/http";
import { IntelligenceObservationCache } from "@/news-observations/synchronized-cache";
import { getPublicationRepository } from "@/publications/repository";
import type { DatabaseSync } from "node:sqlite";

export const dynamic = "force-dynamic";

const ReviewSchema = z.object({
  eligibility: z.enum(["eligible", "ineligible"]),
  note: z.string().trim().min(1).max(500).optional(),
}).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await actorFromRequest(request);
    if (!actor?.roles.includes("operator")) {
      throw new GatewayError("FORBIDDEN", "A configured operations account is required.");
    }
    const body = ReviewSchema.safeParse(await readJsonBody(request));
    if (!body.success) throw new GatewayError("VALIDATION_FAILED", "A valid eligibility decision is required.");
    const { documentId } = await params;
    const repository = getPublicationRepository() as { database?: DatabaseSync };
    if (!repository.database) throw new GatewayError("PERSISTENCE_FAILURE", "Synchronized observation storage is unavailable.");
    const review = new IntelligenceObservationCache(repository.database).reviewEligibility(
      documentId,
      body.data.eligibility,
      { subjectId: actor.subjectId, application: actor.originatingApplication },
      body.data.note,
    );
    return NextResponse.json({ review }, {
      headers: { "cache-control": "no-store", "x-request-id": context.requestId, "x-correlation-id": context.correlationId },
    });
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}
