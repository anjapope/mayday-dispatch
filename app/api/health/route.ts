import { NextResponse } from "next/server";
import { getPublicationRepository } from "@/publications/repository";

/**
 * Reports service/database/migration readiness only. Never includes
 * filesystem paths, connection strings, or any other secret/configuration
 * detail (see docs/operations.md).
 */
export async function GET() {
  const repository = getPublicationRepository();
  const health = (await repository.checkHealth?.()) ?? {
    databaseReachable: false,
    migrations: { appliedCount: 0, availableCount: 0, upToDate: false },
  };

  const healthy = health.databaseReachable && health.migrations.upToDate;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: { status: "ok" },
      database: { reachable: health.databaseReachable },
      migrations: {
        appliedCount: health.migrations.appliedCount,
        availableCount: health.migrations.availableCount,
        upToDate: health.migrations.upToDate,
      },
    },
    { status: healthy ? 200 : 503 },
  );
}