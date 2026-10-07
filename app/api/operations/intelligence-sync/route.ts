import { NextResponse } from "next/server";
import { z } from "zod";
import { GatewayError } from "@/application/publication-gateway/errors";
import { actorFromRequest, gatewayErrorResponse, readJsonBody, requestContextFromRequest } from "@/application/publication-gateway/http";
import { IntelligenceSyncWorker, loadWorkerConfig } from "@/news-observations/sync-worker";
import { getPublicationRepository } from "@/publications/repository";
import type { DatabaseSync } from "node:sqlite";

export const dynamic = "force-dynamic";

function database(): DatabaseSync {
  const repository = getPublicationRepository() as { database?: DatabaseSync };
  if (!repository.database) throw new GatewayError("PERSISTENCE_FAILURE", "Synchronization storage is unavailable.");
  return repository.database;
}
async function operator(request: Request) {
  const actor = await actorFromRequest(request);
  if (!actor?.roles.includes("operator")) throw new GatewayError("FORBIDDEN", "A configured operations account is required.");
  return actor;
}
function control(action: "pause" | "resume", subjectId: string): void {
  const status = action === "pause" ? "paused" : "starting";
  const db = database();
  db.prepare("UPDATE intelligence_sync_worker_state SET paused = ?, status = ?, next_run_at = NULL, updated_at = ? WHERE worker_name = 'intelligence-sync'")
    .run(action === "pause" ? 1 : 0, status, new Date().toISOString());
  db.prepare("INSERT INTO intelligence_sync_worker_audit_events (event_type, actor_subject_id, occurred_at) VALUES (?, ?, ?)")
    .run(action, subjectId, new Date().toISOString());
}

export async function GET(request: Request) {
  try {
    await operator(request);
    const db = database();
    const state = db.prepare("SELECT * FROM intelligence_sync_worker_state WHERE worker_name = 'intelligence-sync'").get();
    const counts = db.prepare("SELECT COUNT(*) AS cached, SUM(eligibility = 'requires_review') AS requiresReview, SUM(eligibility = 'eligible') AS eligible, SUM(eligibility = 'ineligible') AS ineligible FROM intelligence_observations").get();
    const checkpoint = db.prepare("SELECT COUNT(*) AS count FROM intelligence_sync_checkpoints WHERE continuation_cursor IS NOT NULL").get() as { count: number };
    return NextResponse.json({ state, counts, checkpointPresent: checkpoint.count > 0 }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return gatewayErrorResponse(error, requestContextFromRequest(request));
  }
}

export async function POST(request: Request) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await operator(request);
    const parsed = z.object({ action: z.enum(["pause", "resume", "sync"]) }).strict().safeParse(await readJsonBody(request));
    if (!parsed.success) throw new GatewayError("VALIDATION_FAILED", "A valid synchronization action is required.");
    if (parsed.data.action === "pause" || parsed.data.action === "resume") {
      control(parsed.data.action, actor.subjectId);
      return NextResponse.json({ action: parsed.data.action }, { headers: { "cache-control": "no-store" } });
    }
    const worker = new IntelligenceSyncWorker(database(), loadWorkerConfig());
    worker.acquire();
    try {
      const result = await worker.runOnce(true);
      return NextResponse.json({ action: "sync", result }, { headers: { "cache-control": "no-store" } });
    } finally {
      worker.release();
    }
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}
