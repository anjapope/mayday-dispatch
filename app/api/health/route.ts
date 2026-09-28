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
    databaseWritable: false,
    migrations: {
      appliedCount: 0,
      availableCount: 0,
      schemaVersion: 0,
      targetSchemaVersion: 0,
      compatible: false,
      upToDate: false,
    },
  };

  const healthy =
    health.databaseReachable &&
    health.databaseWritable &&
    health.migrations.compatible &&
    health.migrations.upToDate;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: { status: "ok" },
      database: {
        reachable: health.databaseReachable,
        writable: health.databaseWritable,
      },
      migrations: {
        appliedCount: health.migrations.appliedCount,
        availableCount: health.migrations.availableCount,
        schemaVersion: health.migrations.schemaVersion,
        targetSchemaVersion: health.migrations.targetSchemaVersion,
        compatible: health.migrations.compatible,
        upToDate: health.migrations.upToDate,
      },
    },
    { status: healthy ? 200 : 503 },
  );
}