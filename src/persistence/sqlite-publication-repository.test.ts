import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GatewayActor } from "@/application/publication-gateway/authorization";
import { PublicationGatewayService } from "@/application/publication-gateway/service";
import type { RegisteredEvidence } from "@/evidence/registry";
import { runMigrations } from "@/persistence/migrations";
import { SqlitePublicationRepository } from "@/publications/repository";

const temporaryDirectories: string[] = [];
afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

const editor: GatewayActor = { subjectId: "editor", roles: ["editor"] };
const research: GatewayActor = {
  subjectId: "research",
  roles: ["external-application"],
  originatingApplication: "Research Studio",
};
const context = { requestId: "request-9", correlationId: "correlation-9" };
const evidence: RegisteredEvidence = {
  id: "77777777-7777-4777-8777-777777777777",
  title: "Registered dataset",
  mediaType: "text/csv",
  source: "Research Studio",
  provenance: "Mayday3 registration",
  visibility: "public",
  checksum: "b".repeat(64),
  checksumAlgorithm: "sha256",
  status: "ready",
  publicUrl: "https://example.org/evidence/data.csv",
  registeredAt: "2026-09-22T19:30:10.431Z",
  version: 1,
};

function draft(overrides: Record<string, unknown> = {}) {
  return {
    slug: "durable-research-draft",
    type: "academic-research-article",
    title: "Durable Research Draft",
    excerpt: "SQLite persistence test.",
    body: ["The publication survives process restart."],
    readingTimeMinutes: 4,
    visibility: "internal",
    origin: {
      kind: "academic-publication",
      label: "Research Studio",
      url: "https://example.org/research",
      originatingApplication: "Research Studio",
      originatingProject: "Persistence",
      stableObjectId: "research:durable:1",
    },
    createdBy: "Research Studio",
    evidenceIds: [evidence.id],
    sources: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        title: "Source",
        authors: ["Research Desk"],
        url: "https://example.org/source",
      },
    ],
    ...overrides,
  };
}

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "mayday-dispatch-"));
  temporaryDirectories.push(directory);
  return join(directory, "dispatch.sqlite");
}

describe("SqlitePublicationRepository", () => {
  it("runs explicit migrations once and creates every queryable core table", () => {
    const repository = new SqlitePublicationRepository(":memory:", { migrate: false });
    runMigrations(repository.database);
    runMigrations(repository.database);
    const names = repository.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row.name));

    expect(names).toEqual(
      expect.arrayContaining([
        "publications",
        "origins",
        "revisions",
        "evidence_references",
        "publication_evidence",
        "citations",
        "publication_citations",
        "lifecycle_history",
        "audit_events",
        "idempotency_keys",
        "evidence_revisions",
        "evidence_audit_events",
        "evidence_idempotency_keys",
        "schema_migrations",
      ]),
    );
    expect(
      repository.database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get(),
    ).toMatchObject({ count: 4 });
    repository.close();
  });

  it("survives restart with origin, revision, evidence, lifecycle, and audit data", async () => {
    const path = databasePath();
    const firstRepository = new SqlitePublicationRepository(path);
    await firstRepository.register(evidence);
    const firstService = new PublicationGatewayService({
      repository: firstRepository,
      evidenceRegistry: firstRepository,
      now: () => new Date("2026-09-22T19:30:10.431Z"),
    });
    const created = await firstService.createDraft(draft(), research, context);
    await firstService.transition(
      created.publication.id,
      { to: "review", expectedVersion: 1 },
      editor,
      context,
    );
    firstRepository.close();

    const restarted = new SqlitePublicationRepository(path);
    const loaded = await restarted.findByOriginIdentity(
      created.publication.provenance.origin,
    );
    expect(loaded).toMatchObject({
      id: created.publication.id,
      lifecycleState: "review",
      revision: { version: 2, previousVersion: 1 },
    });
    expect(loaded?.evidence[0]).toMatchObject({
      id: evidence.id,
      checksum: evidence.checksum,
    });
    expect(
      restarted.database
        .prepare("SELECT COUNT(*) AS count FROM revisions WHERE publication_id = ?")
        .get(created.publication.id),
    ).toMatchObject({ count: 2 });
    expect(
      restarted.database
        .prepare("SELECT COUNT(*) AS count FROM lifecycle_history WHERE publication_id = ?")
        .get(created.publication.id),
    ).toMatchObject({ count: 2 });
    expect(
      restarted.database
        .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE publication_id = ?")
        .get(created.publication.id),
    ).toMatchObject({ count: 2 });
    expect(await restarted.listRevisionHistory(created.publication.id)).toEqual([
      expect.objectContaining({
        version: 1,
        actorSubject: "research",
        lifecycleState: "draft",
      }),
      expect.objectContaining({
        version: 2,
        revisionType: "lifecycle-transition",
        actorSubject: "editor",
        lifecycleState: "review",
      }),
    ]);
    expect(await restarted.listLifecycleHistory(created.publication.id)).toEqual([
      expect.objectContaining({ fromState: undefined, toState: "draft", version: 1 }),
      expect.objectContaining({ fromState: "draft", toState: "review", version: 2 }),
    ]);
    restarted.close();
  });

  it("rolls back the publication mutation when the atomic audit write fails", async () => {
    const repository = new SqlitePublicationRepository(databasePath());
    await repository.register(evidence);
    const repeatedId = "99999999-9999-4999-8999-999999999999";
    const service = new PublicationGatewayService({
      repository,
      evidenceRegistry: repository,
      idFactory: () => repeatedId,
      now: () => new Date("2026-09-22T19:30:10.431Z"),
    });
    const created = await service.createDraft(draft(), research, context);

    await expect(
      service.update(
        created.publication.id,
        { title: "Must roll back", expectedVersion: 1 },
        editor,
        context,
      ),
    ).rejects.toMatchObject({ code: "AUDIT_FAILURE" });
    const persisted = await repository.findById(created.publication.id);
    expect(persisted).toMatchObject({
      title: "Durable Research Draft",
      revision: { version: 1 },
    });
    expect(
      repository.database
        .prepare("SELECT COUNT(*) AS count FROM revisions WHERE publication_id = ?")
        .get(created.publication.id),
    ).toMatchObject({ count: 1 });
    repository.close();
  });

  it("enforces concurrent writers at the transaction boundary", async () => {
    const path = databasePath();
    const repository = new SqlitePublicationRepository(path);
    await repository.register(evidence);
    const service = new PublicationGatewayService({
      repository,
      evidenceRegistry: repository,
      now: () => new Date("2026-09-22T19:30:10.431Z"),
    });
    const created = await service.createDraft(draft(), research, context);
    await service.update(
      created.publication.id,
      { title: "First writer", expectedVersion: 1 },
      editor,
      context,
    );
    await expect(
      service.update(
        created.publication.id,
        { title: "Stale writer", expectedVersion: 1 },
        editor,
        context,
      ),
    ).rejects.toMatchObject({ code: "STALE_VERSION" });
    repository.close();
  });
});
