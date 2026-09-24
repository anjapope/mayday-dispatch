import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AttachEvidenceRequest,
  CreateDraftPublicationRequest,
  TransitionPublicationRequest,
  UpdatePublicationRequest,
} from "@/application/publication-gateway/dto";
import { ResearchStudioDispatchClient, ResearchStudioVersionConflictError } from "@/integrations/research-studio/client";
import { runMigrations } from "@/persistence/migrations";
import type { SqlitePublicationRepository } from "@/publications/repository";

const databasePath = join(tmpdir(), `mayday-dispatch-phase-four-${process.pid}.sqlite`);
const researchStudioToken = "research-studio-machine-token";
const editorialToken = "dispatch-editorial-machine-token";

const evidence = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Published methodology appendix",
  mediaType: "application/pdf",
  source: "Research Studio",
  provenance: "Mayday3 collection run 42",
  visibility: "public",
  checksum: "a".repeat(64),
  status: "ready",
  publicUrl: "https://example.org/evidence/appendix",
};

const draft = {
  slug: "research-studio-http-integration",
  type: "academic-research-article",
  title: "Research Studio HTTP integration",
  excerpt: "A durable gateway integration draft.",
  body: ["The gateway is exercised through its HTTP route boundary."],
  readingTimeMinutes: 4,
  tags: [],
  visibility: "public",
  origin: {
    kind: "academic-publication",
    label: "Research Studio",
    url: "https://example.org/research/http-integration",
    originatingApplication: "Research Studio",
    originatingProject: "Integration Desk",
    stableObjectId: "research:http-integration:1",
  },
  createdBy: "Research Studio",
  verificationStatus: "unverified",
  evidenceIds: [],
  sources: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Integration source",
      authors: ["Research Studio"],
      url: "https://example.org/source",
    },
  ],
} satisfies CreateDraftPublicationRequest;

type Routes = {
  create: (request: Request) => Promise<Response>;
  retrieve: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  update: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  attachEvidence: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  transition: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  registerEvidence: (request: Request) => Promise<Response>;
  getEvidence: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  publicPublication: (request: Request, context: { params: Promise<{ slug: string }> }) => Promise<Response>;
};

let routes: Routes;
let restoreEnvironment: () => void;

function hash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input.toString());
  const request = new Request(url, init);
  const publicationMatch = url.pathname.match(/^\/api\/publications\/([^/]+)$/);
  const evidenceMatch = url.pathname.match(/^\/api\/evidence\/([^/]+)$/);
  const publicMatch = url.pathname.match(/^\/api\/public\/publications\/([^/]+)$/);

  if (url.pathname === "/api/publications" && request.method === "POST") {
    return routes.create(request);
  }
  if (publicationMatch && request.method === "GET") {
    return routes.retrieve(request, { params: Promise.resolve({ id: publicationMatch[1] }) });
  }
  if (publicationMatch && request.method === "PATCH") {
    return routes.update(request, { params: Promise.resolve({ id: publicationMatch[1] }) });
  }
  if (url.pathname === "/api/evidence" && request.method === "POST") {
    return routes.registerEvidence(request);
  }
  if (url.pathname.endsWith("/evidence") && request.method === "POST") {
    const id = url.pathname.split("/")[3];
    return routes.attachEvidence(request, { params: Promise.resolve({ id }) });
  }
  if (url.pathname.endsWith("/transition") && request.method === "POST") {
    const id = url.pathname.split("/")[3];
    return routes.transition(request, { params: Promise.resolve({ id }) });
  }
  if (evidenceMatch && request.method === "GET") {
    return routes.getEvidence(request, { params: Promise.resolve({ id: evidenceMatch[1] }) });
  }
  if (publicMatch && request.method === "GET") {
    return routes.publicPublication(request, { params: Promise.resolve({ slug: publicMatch[1] }) });
  }
  throw new Error(`Unhandled integration request: ${request.method} ${url.pathname}`);
}

beforeAll(async () => {
  rmSync(databasePath, { force: true });
  const database = new DatabaseSync(databasePath);
  runMigrations(database);
  database.close();

  const previous = {
    databasePath: process.env.MAYDAY_DATABASE_PATH,
    credentials: process.env.MAYDAY_APPLICATION_CREDENTIALS,
    trustDevHeaders: process.env.MAYDAY_TRUST_DEV_HEADERS,
  };
  process.env.MAYDAY_DATABASE_PATH = databasePath;
  process.env.MAYDAY_APPLICATION_CREDENTIALS = JSON.stringify([
    {
      applicationName: "Research Studio",
      subjectId: "research-studio-service",
      roles: ["external-application"],
      tokenHash: hash(researchStudioToken),
    },
    {
      applicationName: "Dispatch Editorial",
      subjectId: "dispatch-editorial-service",
      roles: ["editor", "publisher"],
      tokenHash: hash(editorialToken),
    },
  ]);
  delete process.env.MAYDAY_TRUST_DEV_HEADERS;
  restoreEnvironment = () => {
    process.env.MAYDAY_DATABASE_PATH = previous.databasePath;
    process.env.MAYDAY_APPLICATION_CREDENTIALS = previous.credentials;
    process.env.MAYDAY_TRUST_DEV_HEADERS = previous.trustDevHeaders;
  };

  const publications = await import("../../../app/api/publications/route");
  const publication = await import("../../../app/api/publications/[id]/route");
  const association = await import("../../../app/api/publications/[id]/evidence/route");
  const lifecycle = await import("../../../app/api/publications/[id]/transition/route");
  const evidenceRoutes = await import("../../../app/api/evidence/route");
  const evidenceById = await import("../../../app/api/evidence/[id]/route");
  const publicPublication = await import("../../../app/api/public/publications/[slug]/route");
  routes = {
    create: publications.POST,
    retrieve: publication.GET,
    update: publication.PATCH,
    attachEvidence: association.POST,
    transition: lifecycle.POST,
    registerEvidence: evidenceRoutes.POST,
    getEvidence: evidenceById.GET,
    publicPublication: publicPublication.GET,
  };
});

afterAll(async () => {
  const { getPublicationRepository } = await import("@/publications/repository");
  (getPublicationRepository() as SqlitePublicationRepository).close();
  restoreEnvironment();
  rmSync(databasePath, { force: true });
});

describe("Research Studio HTTP to Dispatch SQLite integration", () => {
  it("persists authenticated synchronization, locking, evidence, and public-safe projections", async () => {
    const researchClient = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.integration.test",
      applicationName: "Research Studio",
      credential: { bearerToken: researchStudioToken },
      fetch: routeFetch as typeof fetch,
    });
    const editorialClient = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.integration.test",
      applicationName: "Dispatch Editorial",
      credential: { bearerToken: editorialToken },
      fetch: routeFetch as typeof fetch,
    });

    const registered = await routeFetch("https://dispatch.integration.test/api/evidence", {
      method: "POST",
      headers: {
        authorization: `Bearer ${researchStudioToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(evidence),
    });
    expect(registered.status, await registered.clone().text()).toBe(201);
    expect((await registered.json()).evidence).toMatchObject({ id: evidence.id });

    const malformed = await routeFetch("https://dispatch.integration.test/api/evidence", {
      method: "POST",
      headers: { authorization: `Bearer ${researchStudioToken}`, "content-type": "application/json" },
      body: JSON.stringify({ id: evidence.id }),
    });
    expect(malformed.status).toBe(400);
    const unknown = await routeFetch("https://dispatch.integration.test/api/evidence/33333333-3333-4333-8333-333333333333", {
      headers: { authorization: `Bearer ${researchStudioToken}` },
    });
    expect(unknown.status).toBe(404);
    const invalidCredential = await routeFetch("https://dispatch.integration.test/api/evidence", {
      method: "POST",
      headers: { authorization: "Bearer incorrect", "content-type": "application/json" },
      body: JSON.stringify(evidence),
    });
    expect(invalidCredential.status).toBe(401);

    const created = await researchClient.createDraft(draft, {
      idempotencyKey: "research-http-create-1",
      requestId: "request-create",
      correlationId: "correlation-create",
    });
    expect(created.originLink).toMatchObject({
      publicationId: created.publication.id,
      version: 1,
      editorialUrl: `/editor/publications/${created.publication.id}`,
    });
    const replayed = await researchClient.createDraft(draft, { idempotencyKey: "research-http-create-1" });
    expect(replayed.originLink.version).toBe(1);

    const attached = await researchClient.attachEvidence(created.publication.id, {
      evidenceId: evidence.id,
      expectedVersion: 1,
      revisionSummary: "Attach registered evidence.",
    } satisfies AttachEvidenceRequest);
    expect(attached.publication.evidence).toHaveLength(1);

    await expect(
      researchClient.updateDraft(created.publication.id, {
        title: "Stale update",
        expectedVersion: 1,
        revisionSummary: "Attempt stale update.",
      } satisfies UpdatePublicationRequest),
    ).rejects.toBeInstanceOf(ResearchStudioVersionConflictError);
    expect(await researchClient.retrieveCurrentVersion(created.publication.id)).toBe(2);

    const updated = await researchClient.updateDraft(created.publication.id, {
      title: "Recovered after refresh",
      expectedVersion: 2,
      revisionSummary: "Recover after refresh.",
    } satisfies UpdatePublicationRequest);
    expect(updated.originLink.version).toBe(3);

    const review = await editorialClient.requestLifecycle(created.publication.id, {
      to: "review",
      expectedVersion: 3,
      revisionSummary: "Submit for review.",
    } satisfies TransitionPublicationRequest);
    await expect(
      researchClient.createDraft({
        ...draft,
        title: "Blocked external synchronization",
        expectedVersion: review.originLink.version,
      }),
    ).rejects.toMatchObject({
      code: "EDITORIAL_LOCK",
      publicationId: created.publication.id,
      currentVersion: 4,
      currentLifecycleState: "review",
    });

    const ready = await editorialClient.requestLifecycle(created.publication.id, {
      to: "ready",
      expectedVersion: 4,
      revisionSummary: "Mark ready.",
    } satisfies TransitionPublicationRequest);
    await editorialClient.requestLifecycle(created.publication.id, {
      to: "published",
      expectedVersion: ready.originLink.version,
      revisionSummary: "Publish approved dispatch.",
    } satisfies TransitionPublicationRequest);
    const publicResponse = await routeFetch(
      "https://dispatch.integration.test/api/public/publications/research-studio-http-integration",
    );
    expect(publicResponse.status).toBe(200);
    const publicBody = JSON.stringify(await publicResponse.json());
    expect(publicBody).not.toContain("originatingApplication");
    expect(publicBody).not.toContain("provenance");
    expect(publicBody).not.toContain("checksum");

    const { SqlitePublicationRepository } = await import("@/publications/repository");
    const firstRepository = new SqlitePublicationRepository(databasePath, { migrate: false });
    const persisted = await firstRepository.findById(created.publication.id);
    expect(persisted?.revision.version).toBe(6);
    expect(await firstRepository.getRegisteredEvidence(evidence.id)).toMatchObject({
      provenance: evidence.provenance,
      visibility: "public",
    });
    firstRepository.close();
  });
});
