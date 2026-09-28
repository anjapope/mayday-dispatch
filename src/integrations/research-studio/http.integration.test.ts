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
import { OverwatchDispatchClient } from "@/integrations/overwatch/client";
import { Mayday3EvidenceClient } from "@/integrations/mayday3/client";
import { overwatchPublicationFixtures } from "@/integrations/overwatch/fixtures";
import { toPublicPublication } from "@/domain/publication";
import { runMigrations } from "@/persistence/migrations";
import type { SqlitePublicationRepository } from "@/publications/repository";

const databasePath = join(tmpdir(), `mayday-dispatch-phase-four-${process.pid}.sqlite`);
const researchStudioToken = "research-studio-machine-token";
const overwatchToken = "overwatch-machine-token";
const mayday3Token = "mayday3-machine-token";
const editorialToken = "dispatch-editorial-machine-token";
const operatorToken = "dispatch-operator-machine-token";
const sessionSecret = "phase-eleven-integration-session-key-32-bytes";
const integrationOrigin = "https://dispatch.integration.test";

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
  updateEvidence: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  publicPublication: (request: Request, context: { params: Promise<{ slug: string }> }) => Promise<Response>;
  editorialList: (request: Request) => Promise<Response>;
  editorialPublication: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  editorialPreview: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  editorialTransition: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  publicationLockdown: {
    GET: (request: Request) => Promise<Response>;
    PUT: (request: Request) => Promise<Response>;
  };
  editorialSession: {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
    DELETE: (request: Request) => Promise<Response>;
  };
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
  const editorialMatch = url.pathname.match(/^\/api\/editorial\/publications\/([^/]+)$/);
  const editorialPreviewMatch = url.pathname.match(/^\/api\/editorial\/publications\/([^/]+)\/preview$/);
  const editorialTransitionMatch = url.pathname.match(/^\/api\/editorial\/publications\/([^/]+)\/transition$/);

  if (url.pathname === "/api/operations/publication-lockdown" && request.method === "GET") {
    return routes.publicationLockdown.GET(request);
  }
  if (url.pathname === "/api/operations/publication-lockdown" && request.method === "PUT") {
    return routes.publicationLockdown.PUT(request);
  }
  if (url.pathname === "/api/editorial/session" && request.method === "GET") {
    return routes.editorialSession.GET(request);
  }
  if (url.pathname === "/api/editorial/session" && request.method === "POST") {
    return routes.editorialSession.POST(request);
  }
  if (url.pathname === "/api/editorial/session" && request.method === "DELETE") {
    return routes.editorialSession.DELETE(request);
  }
  if (url.pathname === "/api/publications" && request.method === "POST") {
    return routes.create(request);
  }
  if (url.pathname === "/api/editorial/publications" && request.method === "GET") {
    return routes.editorialList(request);
  }
  if (editorialPreviewMatch && request.method === "GET") {
    return routes.editorialPreview(request, { params: Promise.resolve({ id: editorialPreviewMatch[1] }) });
  }
  if (editorialTransitionMatch && request.method === "POST") {
    return routes.editorialTransition(request, { params: Promise.resolve({ id: editorialTransitionMatch[1] }) });
  }
  if (editorialMatch && request.method === "GET") {
    return routes.editorialPublication(request, { params: Promise.resolve({ id: editorialMatch[1] }) });
  }
  if (editorialMatch && request.method === "PATCH") {
    return routes.editorialPublication(request, { params: Promise.resolve({ id: editorialMatch[1] }) });
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
  if (evidenceMatch && request.method === "PATCH") {
    return routes.updateEvidence(request, { params: Promise.resolve({ id: evidenceMatch[1] }) });
  }
  if (publicMatch && request.method === "GET") {
    return routes.publicPublication(request, { params: Promise.resolve({ slug: publicMatch[1] }) });
  }
  throw new Error(`Unhandled integration request: ${request.method} ${url.pathname}`);
}

async function releaseWithEditorialSession(
  publicationId: string,
  expectedVersion: number,
  revisionSummary: string,
  cookie?: string,
): Promise<Response> {
  let sessionCookie = cookie;
  if (!sessionCookie) {
    const signIn = await routeFetch(`${integrationOrigin}/api/editorial/session`, {
      method: "POST",
      headers: { authorization: `Bearer ${editorialToken}` },
    });
    if (!signIn.ok) {
      throw new Error(`Editorial integration sign-in failed with HTTP ${signIn.status}.`);
    }
    sessionCookie = signIn.headers.get("set-cookie")?.split(";")[0];
  }
  if (!sessionCookie) {
    throw new Error("Editorial integration sign-in did not issue a session cookie.");
  }
  return routeFetch(
    `${integrationOrigin}/api/editorial/publications/${publicationId}/transition`,
    {
      method: "POST",
      headers: {
        cookie: sessionCookie,
        origin: integrationOrigin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ to: "published", expectedVersion, revisionSummary }),
    },
  );
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
    sessionSecret: process.env.MAYDAY_SESSION_SECRET,
    publicBaseUrl: process.env.MAYDAY_PUBLIC_BASE_URL,
    editorialOrigin: process.env.MAYDAY_EDITORIAL_ORIGIN,
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
    {
      applicationName: "overwatch",
      subjectId: "overwatch-service",
      roles: ["external-application"],
      tokenHash: hash(overwatchToken),
    },
    {
      applicationName: "mayday3",
      subjectId: "mayday3-service",
      roles: ["external-application"],
      tokenHash: hash(mayday3Token),
    },
    {
      applicationName: "Dispatch Operations",
      subjectId: "dispatch-operator",
      roles: ["operator"],
      tokenHash: hash(operatorToken),
    },
  ]);
  process.env.MAYDAY_SESSION_SECRET = sessionSecret;
  process.env.MAYDAY_PUBLIC_BASE_URL = "https://dispatch.integration.test";
  process.env.MAYDAY_EDITORIAL_ORIGIN = integrationOrigin;
  delete process.env.MAYDAY_TRUST_DEV_HEADERS;
  restoreEnvironment = () => {
    if (previous.databasePath === undefined) delete process.env.MAYDAY_DATABASE_PATH;
    else process.env.MAYDAY_DATABASE_PATH = previous.databasePath;
    if (previous.credentials === undefined) delete process.env.MAYDAY_APPLICATION_CREDENTIALS;
    else process.env.MAYDAY_APPLICATION_CREDENTIALS = previous.credentials;
    if (previous.trustDevHeaders === undefined) delete process.env.MAYDAY_TRUST_DEV_HEADERS;
    else process.env.MAYDAY_TRUST_DEV_HEADERS = previous.trustDevHeaders;
    if (previous.sessionSecret === undefined) delete process.env.MAYDAY_SESSION_SECRET;
    else process.env.MAYDAY_SESSION_SECRET = previous.sessionSecret;
    if (previous.publicBaseUrl === undefined) delete process.env.MAYDAY_PUBLIC_BASE_URL;
    else process.env.MAYDAY_PUBLIC_BASE_URL = previous.publicBaseUrl;
    if (previous.editorialOrigin === undefined) delete process.env.MAYDAY_EDITORIAL_ORIGIN;
    else process.env.MAYDAY_EDITORIAL_ORIGIN = previous.editorialOrigin;
  };

  const publications = await import("../../../app/api/publications/route");
  const publication = await import("../../../app/api/publications/[id]/route");
  const association = await import("../../../app/api/publications/[id]/evidence/route");
  const lifecycle = await import("../../../app/api/publications/[id]/transition/route");
  const evidenceRoutes = await import("../../../app/api/evidence/route");
  const evidenceById = await import("../../../app/api/evidence/[id]/route");
  const publicPublication = await import("../../../app/api/public/publications/[slug]/route");
  const editorialPublications = await import("../../../app/api/editorial/publications/route");
  const editorialPublication = await import("../../../app/api/editorial/publications/[id]/route");
  const editorialPreview = await import("../../../app/api/editorial/publications/[id]/preview/route");
  const editorialTransition = await import("../../../app/api/editorial/publications/[id]/transition/route");
  const publicationLockdown = await import("../../../app/api/operations/publication-lockdown/route");
  const editorialSession = await import("../../../app/api/editorial/session/route");
  routes = {
    create: publications.POST,
    retrieve: publication.GET,
    update: publication.PATCH,
    attachEvidence: association.POST,
    transition: lifecycle.POST,
    registerEvidence: evidenceRoutes.POST,
    getEvidence: evidenceById.GET,
    updateEvidence: evidenceById.PATCH,
    publicPublication: publicPublication.GET,
    editorialList: editorialPublications.GET,
    editorialPublication: editorialPublication.GET,
    editorialPreview: editorialPreview.GET,
    editorialTransition: editorialTransition.POST,
    publicationLockdown,
    editorialSession,
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
    const oversizedRequest = await routeFetch("https://dispatch.integration.test/api/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(1024 * 1024 + 1),
    });
    expect(oversizedRequest.status).toBe(413);

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
    const released = await releaseWithEditorialSession(
      created.publication.id,
      ready.originLink.version,
      "Publish approved dispatch.",
    );
    expect(released.status).toBe(200);
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
    const restartedRepository = new SqlitePublicationRepository(databasePath, { migrate: false });
    expect(await restartedRepository.getPublicSnapshotBySlug("research-studio-http-integration"))
      .toMatchObject({ id: created.publication.id, revision: { version: 6 } });
    const releaseManifests = await restartedRepository.listReleaseManifests(created.publication.id);
    expect(releaseManifests).toHaveLength(1);
    const releaseManifest = releaseManifests[0];
    if (!releaseManifest) throw new Error("The release manifest was not persisted.");
    restartedRepository.database.prepare(`
      UPDATE publication_release_manifests SET publisher_subject_id = ?
      WHERE release_operation_id = ?
    `).run("tampered-publisher", releaseManifest.releaseOperationId);
    await expect(
      restartedRepository.getPublicSnapshotBySlug("research-studio-http-integration"),
    ).rejects.toMatchObject({ name: "RepositoryPersistenceError" });
    restartedRepository.database.prepare(`
      UPDATE publication_release_manifests SET publisher_subject_id = ?
      WHERE release_operation_id = ?
    `).run(releaseManifest.publisherSubjectId, releaseManifest.releaseOperationId);
    expect(await restartedRepository.getPublicSnapshotBySlug("research-studio-http-integration"))
      .toMatchObject({ id: created.publication.id, revision: { version: 6 } });
    restartedRepository.close();
  });

  it("supports an authenticated Overwatch situation report without cross-application impersonation", async () => {
    const overwatchClient = new OverwatchDispatchClient({
      baseUrl: "https://dispatch.integration.test",
      credential: { bearerToken: overwatchToken },
      fetch: routeFetch as typeof fetch,
    });

    {
      const signIn = await routeFetch("https://dispatch.integration.test/api/editorial/session", {
        method: "POST",
        headers: { authorization: `Bearer ${editorialToken}` },
      });
      expect(signIn.status).toBe(200);
      const setCookie = signIn.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");
      const sessionCookie = setCookie.split(";")[0];
      if (!sessionCookie) throw new Error("Editorial sign-in did not issue a session cookie.");

      const { createEditorialSession, editorialSessionCookie, EDITORIAL_SESSION_MAX_AGE_SECONDS } =
        await import("@/security/editorial-session");
      expect(editorialSessionCookie("test-session", true)).toContain("Secure");
      const malformed = await routeFetch("https://dispatch.integration.test/api/editorial/session", {
        headers: { cookie: "mayday-editorial-session=malformed" },
      });
      expect(malformed.status).toBe(401);
      const expiredToken = createEditorialSession(
        {
          subjectId: "dispatch-editorial-service",
          originatingApplication: "Dispatch Editorial",
          roles: ["editor", "publisher"],
        },
        Date.now() - EDITORIAL_SESSION_MAX_AGE_SECONDS * 1000 - 1000,
      );
      const expired = await routeFetch("https://dispatch.integration.test/api/editorial/session", {
        headers: { cookie: `mayday-editorial-session=${expiredToken}` },
      });
      expect(expired.status).toBe(401);

      const originalCredentials = process.env.MAYDAY_APPLICATION_CREDENTIALS;
      const credentials = JSON.parse(originalCredentials ?? "[]") as Array<{
        applicationName: string;
        tokenHash?: string;
        roles?: string[];
      }>;
      const editorialCredential = credentials.find(
        (credential) => credential.applicationName === "Dispatch Editorial",
      );
      if (!editorialCredential) throw new Error("Editorial integration credential is missing.");

      try {
        editorialCredential.roles = ["editor"];
        process.env.MAYDAY_APPLICATION_CREDENTIALS = JSON.stringify(credentials);
        const changedRoles = await routeFetch("https://dispatch.integration.test/api/editorial/session", {
          headers: { cookie: sessionCookie },
        });
        expect(changedRoles.status).toBe(401);

        editorialCredential.roles = ["editor", "publisher"];
        editorialCredential.tokenHash = hash(`${editorialToken}-rotated`);
        process.env.MAYDAY_APPLICATION_CREDENTIALS = JSON.stringify(credentials);

        const oldSession = await routeFetch("https://dispatch.integration.test/api/editorial/session", {
          headers: { cookie: sessionCookie },
        });
        expect(oldSession.status).toBe(401);

        const logout = await routeFetch("https://dispatch.integration.test/api/editorial/session", {
          method: "DELETE",
          headers: { cookie: "mayday-editorial-session=invalid" },
        });
        expect(logout.status).toBe(200);
        expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
      } finally {
        if (originalCredentials === undefined) delete process.env.MAYDAY_APPLICATION_CREDENTIALS;
        else process.env.MAYDAY_APPLICATION_CREDENTIALS = originalCredentials;
      }
    }
    const editorialClient = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.integration.test",
      applicationName: "Dispatch Editorial",
      credential: { bearerToken: editorialToken },
      fetch: routeFetch as typeof fetch,
    });
    const overwatchEvidenceId = "66666666-6666-4666-8666-666666666666";
    const evidenceResponse = await routeFetch("https://dispatch.integration.test/api/evidence", {
      method: "POST",
      headers: {
        authorization: `Bearer ${overwatchToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: overwatchEvidenceId,
        title: "Mayday3 processed source collection",
        mediaType: "application/json",
        source: "Mayday3",
        provenance: "Mayday3 collection run 2026-09-24",
        visibility: "public",
        checksum: "b".repeat(64),
        processor: "mayday3-normalizer",
        status: "ready",
        publicUrl: "https://example.org/overwatch/source-collection",
      }),
    });
    expect(evidenceResponse.status).toBe(201);
    const created = await overwatchClient.submit({
      overwatchObjectId: "ow:situation:2026-09-24",
      projectId: "monitor:regional-security",
      title: "Regional situation report",
      summary: "A monitored change in regional conditions.",
      body: [
        "Two public sources report the same change during the current reporting period.",
        "The assessment remains moderate confidence pending additional corroboration.",
      ],
      publicationType: "situation-report",
      slug: "regional-situation-report",
      tags: ["situation-report", "monitoring"],
      visibility: "public",
      readingTimeMinutes: 3,
      citations: [{
        id: "44444444-4444-4444-8444-444444444444",
        title: "Regional public notice",
        authors: ["Regional Observatory"],
        url: "https://example.org/regional-notice",
      }],
      evidenceIds: [overwatchEvidenceId],
      assessment: {
        confidenceLevel: "moderate",
        sourceCount: 2,
        geographicScope: "Eastern region",
        temporalScope: "2026-09-24",
        confidenceRationale: "Two independent public sources agree.",
      },
      seriesId: "regional-monitoring",
      reportingPeriod: "2026-09-24",
      idempotencyKey: "ow-situation-2026-09-24",
    });
    expect(created.originLink.origin).toMatchObject({
      originatingApplication: "overwatch",
      originatingProject: "monitor:regional-security",
      stableObjectId: "ow:situation:2026-09-24",
    });
    const replayed = await overwatchClient.submit({
      overwatchObjectId: "ow:situation:2026-09-24",
      projectId: "monitor:regional-security",
      title: "Regional situation report",
      summary: "A monitored change in regional conditions.",
      body: [
        "Two public sources report the same change during the current reporting period.",
        "The assessment remains moderate confidence pending additional corroboration.",
      ],
      publicationType: "situation-report",
      slug: "regional-situation-report",
      tags: ["situation-report", "monitoring"],
      visibility: "public",
      readingTimeMinutes: 3,
      citations: [{
        id: "44444444-4444-4444-8444-444444444444",
        title: "Regional public notice",
        authors: ["Regional Observatory"],
        url: "https://example.org/regional-notice",
      }],
      evidenceIds: [overwatchEvidenceId],
      assessment: {
        confidenceLevel: "moderate",
        sourceCount: 2,
        geographicScope: "Eastern region",
        temporalScope: "2026-09-24",
        confidenceRationale: "Two independent public sources agree.",
      },
      seriesId: "regional-monitoring",
      reportingPeriod: "2026-09-24",
      idempotencyKey: "ow-situation-2026-09-24",
    });
    expect(replayed.publication.id).toBe(created.publication.id);
    const updated = await overwatchClient.update(created.publication.id, {
      overwatchObjectId: "ow:situation:2026-09-24",
      projectId: "monitor:regional-security",
      title: "Regional situation report updated",
      summary: "A monitored change in regional conditions.",
      body: ["Two public sources now report the same change."],
      publicationType: "situation-report",
      slug: "regional-situation-report",
      readingTimeMinutes: 3,
      expectedVersion: 1,
    });
    expect(updated.originLink.version).toBe(2);
    await expect(overwatchClient.update(created.publication.id, {
      overwatchObjectId: "ow:situation:2026-09-24",
      projectId: "monitor:regional-security",
      title: "Stale update",
      summary: "Stale",
      body: ["Stale"],
      publicationType: "situation-report",
      slug: "regional-situation-report",
      readingTimeMinutes: 3,
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "STALE_VERSION" });
    const review = await editorialClient.requestLifecycle(created.publication.id, {
      to: "review",
      expectedVersion: 2,
      revisionSummary: "Submit Overwatch report for editorial review.",
    });
    expect(review.originLink.version).toBe(3);
    await expect(overwatchClient.update(created.publication.id, {
      overwatchObjectId: "ow:situation:2026-09-24",
      projectId: "monitor:regional-security",
      title: "Locked update",
      summary: "Locked",
      body: ["Locked"],
      publicationType: "situation-report",
      slug: "regional-situation-report",
      readingTimeMinutes: 3,
      expectedVersion: 3,
    })).rejects.toMatchObject({ code: "EDITORIAL_LOCK" });
    const researchClient = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.integration.test",
      credential: { bearerToken: researchStudioToken },
      applicationName: "Research Studio",
      fetch: routeFetch as typeof fetch,
    });
    await expect(researchClient.createDraft({
      slug: "research-cannot-impersonate-overwatch",
      type: "situation-report",
      title: "Impersonation attempt",
      excerpt: "Rejected.",
      body: ["Rejected."],
      readingTimeMinutes: 1,
      tags: [],
      visibility: "internal",
      origin: {
        kind: "open-source-intelligence",
        label: "Overwatch",
        url: "https://example.org/overwatch",
        originatingApplication: "overwatch",
        originatingProject: "monitor:regional-security",
        stableObjectId: "ow:impersonation",
      },
      createdBy: "Overwatch",
      verificationStatus: "unverified",
      evidenceIds: [],
      sources: [{
        id: "77777777-7777-4777-8777-777777777777",
        title: "Source",
        authors: ["Source"],
        url: "https://example.org/source",
      }],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const invalidClient = new OverwatchDispatchClient({
      baseUrl: "https://dispatch.integration.test",
      credential: { bearerToken: "invalid-overwatch-token" },
      fetch: routeFetch as typeof fetch,
    });
    await expect(invalidClient.submit({
      overwatchObjectId: "ow:invalid",
      projectId: "monitor:regional-security",
      title: "Invalid",
      summary: "Invalid",
      body: ["Invalid"],
      publicationType: "short-dispatch",
      slug: "invalid-overwatch",
      readingTimeMinutes: 1,
      tags: [],
      visibility: "internal",
      evidenceIds: [],
      citations: [{
        id: "55555555-5555-4555-8555-555555555555",
        title: "Source",
        authors: ["Source"],
        url: "https://example.org/source",
      }],
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("persists distinct Overwatch analytical products, revisions, series, and public-safe projections", async () => {
    const overwatchClient = new OverwatchDispatchClient({
      baseUrl: "https://dispatch.integration.test",
      credential: { bearerToken: overwatchToken },
      fetch: routeFetch as typeof fetch,
    });
    const editorialClient = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.integration.test",
      applicationName: "Dispatch Editorial",
      credential: { bearerToken: editorialToken },
      fetch: routeFetch as typeof fetch,
    });
    const [situationReport, intelligenceBrief, monitoringDispatch] = overwatchPublicationFixtures;
    expect(situationReport).toBeDefined();
    expect(intelligenceBrief).toBeDefined();
    expect(monitoringDispatch).toBeDefined();

    const fixtureEvidence = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Eastern Corridor queue observations",
        visibility: "public",
        publicUrl: "https://example.org/evidence/eastern-corridor-queues",
      },
      {
        id: "12121212-1212-4121-8121-121212121212",
        title: "Eastern Corridor official notice",
        visibility: "citation-only",
        citation: {
          id: "15151515-1515-4151-8151-151515151515",
          title: "Eastern Corridor official notice",
          authors: ["Eastern Corridor Authority"],
        },
      },
      {
        id: "13131313-1313-4131-8131-131313131313",
        title: "Freight capacity source collection",
        visibility: "public",
        publicUrl: "https://example.org/evidence/freight-capacity",
      },
      {
        id: "14141414-1414-4141-8141-141414141414",
        title: "Port morning operations notice",
        visibility: "public",
        publicUrl: "https://example.org/evidence/port-morning-notice",
      },
    ];
    for (const item of fixtureEvidence) {
      const response = await routeFetch("https://dispatch.integration.test/api/evidence", {
        method: "POST",
        headers: {
          authorization: `Bearer ${researchStudioToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...item,
          mediaType: "application/json",
          source: "Overwatch collection",
          provenance: "Overwatch representative fixture collection",
          checksum: item.id.replaceAll("-", "").padEnd(64, "0"),
          status: "ready",
        }),
      });
      expect(response.status, await response.clone().text()).toBe(201);
    }

    const createdSituation = await overwatchClient.submit(situationReport!);
    const createdBrief = await overwatchClient.submit(intelligenceBrief!);
    const createdMonitoring = await overwatchClient.submit(monitoringDispatch!);
    expect(createdSituation.originLink.origin).toMatchObject({
      originatingApplication: "overwatch",
      originatingProject: situationReport!.projectId,
      stableObjectId: situationReport!.overwatchObjectId,
    });
    expect(createdBrief.originLink.origin.stableObjectId).toBe(intelligenceBrief!.overwatchObjectId);
    expect(createdMonitoring.originLink.origin.stableObjectId).toBe(monitoringDispatch!.overwatchObjectId);

    const revisedSituation = await overwatchClient.submit({
      ...situationReport!,
      title: "Eastern Corridor Situation Report: 24-25 September (revised)",
      body: [
        ...situationReport!.body,
        "A subsequent official notice confirmed that one crossing reopened during the reporting window.",
      ],
      expectedVersion: 1,
    });
    expect(revisedSituation.publication.id).toBe(createdSituation.publication.id);
    expect(revisedSituation.originLink.version).toBe(2);

    const recurringMonitoring = await overwatchClient.submit({
      ...monitoringDispatch!,
      overwatchObjectId: "ow:monitoring:port-activity:2026-09-26",
      title: "Port Activity Monitoring Dispatch: 26 September AM",
      slug: "port-activity-monitoring-dispatch-2026-09-26-am",
      summary: "No material change was observed during the next morning monitoring window.",
      body: ["No material change was observed between 06:00 UTC and 12:00 UTC on 26 September."],
      reportingPeriod: "2026-09-26T06:00:00Z/2026-09-26T12:00:00Z",
      previousPublicationId: createdMonitoring.publication.id,
    });
    expect(recurringMonitoring.publication.id).not.toBe(createdMonitoring.publication.id);

    const briefForReview = await editorialClient.requestLifecycle(createdBrief.publication.id, {
      to: "review",
      expectedVersion: 1,
      revisionSummary: "Submit intelligence brief for review.",
    });
    const briefReady = await editorialClient.requestLifecycle(createdBrief.publication.id, {
      to: "ready",
      expectedVersion: briefForReview.originLink.version,
      revisionSummary: "Mark intelligence brief ready.",
    });
    const releasedBrief = await releaseWithEditorialSession(
      createdBrief.publication.id,
      briefReady.originLink.version,
      "Publish intelligence brief.",
    );
    expect(releasedBrief.status).toBe(200);

    const { SqlitePublicationRepository } = await import("@/publications/repository");
    const repository = new SqlitePublicationRepository(databasePath, { migrate: false });
    const persistedSituation = await repository.findById(createdSituation.publication.id);
    const persistedBrief = await repository.findById(createdBrief.publication.id);
    const persistedMonitoring = await repository.findById(createdMonitoring.publication.id);
    const persistedRecurringMonitoring = await repository.findById(recurringMonitoring.publication.id);
    expect(persistedSituation?.revision).toMatchObject({ version: 2, previousVersion: 1 });
    expect(persistedSituation?.extensions.overwatch).toMatchObject({
      seriesId: situationReport!.seriesId,
      reportingPeriod: situationReport!.reportingPeriod,
      assessment: expect.objectContaining({
        collectionWindow: situationReport!.assessment?.collectionWindow,
        geographicScope: situationReport!.assessment?.geographicScope,
        corroborationStatus: situationReport!.assessment?.corroborationStatus,
      }),
    });
    expect(persistedBrief?.extensions.overwatch).toMatchObject({
      assessment: expect.objectContaining({
        methodologyNote: intelligenceBrief!.assessment?.methodologyNote,
        confidenceRationale: intelligenceBrief!.assessment?.confidenceRationale,
      }),
    });
    const projectionWithRestrictedEvidence = toPublicPublication({
      ...persistedBrief!,
      evidence: [
        ...persistedBrief!.evidence,
        {
          id: "16161616-1616-4161-8161-161616161616",
          title: "Restricted analyst collection",
          visibility: "internal",
        },
      ],
    });
    expect(projectionWithRestrictedEvidence.evidence).not.toContainEqual(
      expect.objectContaining({ id: "16161616-1616-4161-8161-161616161616" }),
    );
    expect(persistedMonitoring?.extensions.overwatch).toMatchObject({
      seriesId: "port-activity",
      assessment: { confidenceLevel: "low" },
    });
    expect(persistedRecurringMonitoring?.extensions.overwatch).toMatchObject({
      seriesId: "port-activity",
      previousPublicationId: createdMonitoring.publication.id,
    });
    repository.close();

    const publicResponse = await routeFetch(
      "https://dispatch.integration.test/api/public/publications/strategic-intelligence-brief-corridor-resilience",
    );
    expect(publicResponse.status).toBe(200);
    const publicPayload: { publication: Record<string, unknown> } = await publicResponse.json();
    const publicBody = JSON.stringify(publicPayload);
    expect(publicBody).not.toContain("confidenceRationale");
    expect(publicPayload.publication).not.toHaveProperty("assessment");
    expect(publicPayload.publication).not.toHaveProperty("extensions");
    expect(publicBody).toContain("13131313-1313-4131-8131-131313131313");
  });

  it("uses editorial queue filters and preview projection before explicit publication", async () => {
    const editorialClient = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.integration.test",
      applicationName: "Dispatch Editorial",
      credential: { bearerToken: editorialToken },
      fetch: routeFetch as typeof fetch,
    });
    const created = await editorialClient.createDraft({
      slug: "editorial-preview-control",
      type: "research-report",
      title: "Editorial Preview Control",
      excerpt: "A public draft remains unavailable until Dispatch explicitly publishes it.",
      body: ["The preview and public route must use the same safe projection."],
      readingTimeMinutes: 2,
      visibility: "public",
      tags: ["editorial"],
      origin: {
        kind: "partner-submission",
        label: "Dispatch Editorial",
        originatingApplication: "Dispatch Editorial",
        originatingProject: "Editorial Integration",
        stableObjectId: "editorial:preview:control",
      },
      createdBy: "Dispatch Editorial",
      verificationStatus: "unverified",
      sources: [{
        id: "17171717-1717-4171-8171-171717171717",
        title: "Editorial preview source",
        authors: ["Dispatch Editorial"],
        url: "https://example.org/editorial-preview-source",
      }],
      evidenceIds: [],
    });
    const queueResponse = await routeFetch(
      "https://dispatch.integration.test/api/editorial/publications?state=draft&application=Dispatch%20Editorial&type=research-report&visibility=public&project=Editorial%20Integration",
      { headers: { authorization: `Bearer ${editorialToken}` } },
    );
    expect(queueResponse.status).toBe(200);
    expect((await queueResponse.json()).publications).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.publication.id }),
    ]));

    const previewResponse = await routeFetch(
      `https://dispatch.integration.test/api/editorial/publications/${created.publication.id}/preview`,
      { headers: { authorization: `Bearer ${editorialToken}` } },
    );
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(JSON.stringify(preview)).not.toContain("originatingProject");
    const unavailablePublicResponse = await routeFetch(
      "https://dispatch.integration.test/api/public/publications/editorial-preview-control",
    );
    expect(unavailablePublicResponse.status).toBe(404);

    const review = await editorialClient.requestLifecycle(created.publication.id, {
      to: "review",
      expectedVersion: 1,
      revisionSummary: "Begin editorial review.",
    });
    const ready = await editorialClient.requestLifecycle(created.publication.id, {
      to: "ready",
      expectedVersion: review.originLink.version,
      revisionSummary: "Mark editorial preview control ready.",
    });
    const released = await releaseWithEditorialSession(
      created.publication.id,
      ready.originLink.version,
      "Explicitly publish editorial preview control.",
    );
    expect(released.status).toBe(200);
    const publicResponse = await routeFetch(
      "https://dispatch.integration.test/api/public/publications/editorial-preview-control",
    );
    expect(publicResponse.status).toBe(200);
    const publicProjection = await publicResponse.json();
    expect(publicProjection.publication).toMatchObject({
      title: preview.publication.title,
      excerpt: preview.publication.excerpt,
      body: preview.publication.body,
      sources: preview.publication.sources,
      evidence: preview.publication.evidence,
    });
    expect(Object.keys(publicProjection.publication).sort()).toEqual(
      Object.keys(preview.publication).sort(),
    );
  });

  it("accepts Mayday3 evidence ingestion without granting publication authority", async () => {
    const mayday3Client = new Mayday3EvidenceClient({
      baseUrl: "https://dispatch.integration.test",
      credential: { bearerToken: mayday3Token },
      fetch: routeFetch as typeof fetch,
    });
    const evidenceId = "24242424-2424-4242-8242-242424242424";
    const registered = await mayday3Client.registerEvidence({
      id: evidenceId,
      title: "Mayday3 processed public evidence",
      mediaType: "application/pdf",
      source: "Regional Authority",
      sourceUrl: "https://example.org/mayday3-source",
      provenance: "Mayday3 controlled evidence ingestion",
      visibility: "public",
      checksum: "f".repeat(64),
      checksumAlgorithm: "sha256",
      processor: "mayday3-pdf-normalizer",
      status: "processing",
      publicUrl: "https://example.org/mayday3-evidence",
      acquisitionAt: "2026-09-25T12:00:00.000Z",
      collectionId: "integration-evidence",
    }, { idempotencyKey: "mayday3-register-1" });
    expect(registered.evidence).toMatchObject({ version: 1, status: "processing" });
    const ready = await mayday3Client.updateEvidenceProcessingState(evidenceId, {
      expectedVersion: 1,
      status: "ready",
    });
    expect(ready.evidence).toMatchObject({ version: 2, status: "ready" });
    await expect(mayday3Client.updateEvidenceProcessingState(evidenceId, {
      expectedVersion: 1,
      status: "failed",
      processingError: "Internal failure",
    })).rejects.toMatchObject({ code: "STALE_VERSION" });

    const researchClient = new ResearchStudioDispatchClient({
      baseUrl: "https://dispatch.integration.test",
      applicationName: "Research Studio",
      credential: { bearerToken: researchStudioToken },
      fetch: routeFetch as typeof fetch,
    });
    const draftWithMayday3Evidence = await researchClient.createDraft({
      ...draft,
      slug: "research-studio-mayday3-evidence",
      origin: { ...draft.origin, stableObjectId: "research:mayday3-evidence:1" },
      evidenceIds: [evidenceId],
    });
    expect(draftWithMayday3Evidence.publication.evidence).toMatchObject([
      { id: evidenceId, processor: "mayday3-pdf-normalizer", evidenceVersion: 2 },
    ]);
    await expect(mayday3Client.updateEvidenceProcessingState(evidenceId, {
      expectedVersion: 2,
      status: "ready",
    })).resolves.toBeDefined();
    await expect(
      routeFetch(`https://dispatch.integration.test/api/publications/${draftWithMayday3Evidence.publication.id}/transition`, {
        method: "POST",
        headers: { authorization: `Bearer ${mayday3Token}`, "content-type": "application/json" },
        body: JSON.stringify({ to: "review", expectedVersion: 1 }),
      }),
    ).resolves.toMatchObject({ status: 403 });
  });

  it("enforces editorial sessions and audited publication lockdown at the HTTP boundary", async () => {
    const editorialSignIn = await routeFetch(
      "https://dispatch.integration.test/api/editorial/session",
      { method: "POST", headers: { authorization: `Bearer ${editorialToken}` } },
    );
    expect(editorialSignIn.status).toBe(200);
    const editorialCookie = editorialSignIn.headers.get("set-cookie");
    expect(editorialCookie).toContain("HttpOnly");
    expect(editorialCookie).toContain("SameSite=Strict");
    const sessionResponse = await routeFetch(
      "https://dispatch.integration.test/api/editorial/session",
      { headers: { cookie: editorialCookie!.split(";")[0] } },
    );
    expect(sessionResponse.status).toBe(200);
    expect(await sessionResponse.json()).toMatchObject({
      actor: { subjectId: "dispatch-editorial-service", roles: ["editor", "publisher"] },
    });
    const sessionQueue = await routeFetch(
      "https://dispatch.integration.test/api/editorial/publications",
      { headers: { cookie: editorialCookie!.split(";")[0] } },
    );
    expect(sessionQueue.status).toBe(200);
    const editorialCookiePair = editorialCookie!.split(";")[0];
    const internalRuntimeRequest = new Request(
      "http://0.0.0.0:3000/api/editorial/publications",
      {
        method: "POST",
        headers: {
          cookie: editorialCookiePair,
          origin: integrationOrigin,
        },
      },
    );
    const { resolveEditorialSessionActor } = await import("@/security/editorial-session");
    expect(resolveEditorialSessionActor(internalRuntimeRequest)).toMatchObject({
      subjectId: "dispatch-editorial-service",
      roles: ["editor", "publisher"],
    });

    const operatorSignIn = await routeFetch(
      "https://dispatch.integration.test/api/editorial/session",
      { method: "POST", headers: { authorization: `Bearer ${operatorToken}` } },
    );
    expect(operatorSignIn.status).toBe(200);
    const operatorCookie = operatorSignIn.headers.get("set-cookie")!.split(";")[0];

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
    const created = await researchClient.createDraft({
      ...draft,
      slug: "phase-eleven-lockdown-acceptance",
      origin: { ...draft.origin, stableObjectId: "research:phase-eleven-lockdown:1" },
      title: "Phase Eleven Lockdown Acceptance",
    });
    const beforeRelease = await routeFetch(
      "https://dispatch.integration.test/api/public/publications/phase-eleven-lockdown-acceptance",
    );
    expect(beforeRelease.status).toBe(404);
    const { default: sitemap } = await import("../../../app/sitemap");
    const sitemapBeforeRelease = await sitemap();
    expect(sitemapBeforeRelease.map((entry) => entry.url)).not.toContain(
      "https://dispatch.integration.test/publications/phase-eleven-lockdown-acceptance",
    );

    const deniedUpstreamRelease = await routeFetch(
      `https://dispatch.integration.test/api/publications/${created.publication.id}/transition`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${researchStudioToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ to: "review", expectedVersion: 1 }),
      },
    );
    expect(deniedUpstreamRelease.status).toBe(403);

    const review = await editorialClient.requestLifecycle(created.publication.id, {
      to: "review",
      expectedVersion: 1,
      revisionSummary: "Start the acceptance review.",
    });
    const ready = await editorialClient.requestLifecycle(created.publication.id, {
      to: "ready",
      expectedVersion: review.originLink.version,
      revisionSummary: "Complete readiness checks.",
    });

    const machineRelease = await routeFetch(
      `https://dispatch.integration.test/api/publications/${created.publication.id}/transition`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${editorialToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: "published",
          expectedVersion: ready.originLink.version,
          revisionSummary: "M2M credentials cannot authorize a release.",
        }),
      },
    );
    expect(machineRelease.status).toBe(403);

    const crossOriginToggle = await routeFetch(
      "https://dispatch.integration.test/api/operations/publication-lockdown",
      {
        method: "PUT",
        headers: {
          cookie: operatorCookie,
          origin: "https://attacker.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ enabled: true }),
      },
    );
    expect(crossOriginToggle.status).toBe(403);

    const activate = await routeFetch(
      "https://dispatch.integration.test/api/operations/publication-lockdown",
      {
        method: "PUT",
        headers: {
          cookie: operatorCookie,
          origin: "https://dispatch.integration.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ enabled: true }),
      },
    );
    expect(activate.status).toBe(200);
    expect(await activate.json()).toMatchObject({
      publicationLockdown: { enabled: true, version: 1, changedBySubject: "dispatch-operator" },
    });

    const operatorCannotPublish = await routeFetch(
      `https://dispatch.integration.test/api/publications/${created.publication.id}/transition`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: "published",
          expectedVersion: ready.originLink.version,
          revisionSummary: "Operator must not publish.",
        }),
      },
    );
    expect(operatorCannotPublish.status).toBe(403);

    const blockedRelease = await routeFetch(
      `https://dispatch.integration.test/api/publications/${created.publication.id}/transition`,
      {
        method: "POST",
        headers: {
          cookie: editorialCookiePair,
          origin: "https://dispatch.integration.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: "published",
          expectedVersion: ready.originLink.version,
          revisionSummary: "Release blocked by operational lockdown.",
        }),
      },
    );
    expect(blockedRelease.status).toBe(423);
    expect((await routeFetch(
      "https://dispatch.integration.test/api/public/publications/phase-eleven-lockdown-acceptance",
    )).status).toBe(404);

    const publishedBeforeLockdown = await routeFetch(
      "https://dispatch.integration.test/api/public/publications/research-studio-http-integration",
    );
    expect(publishedBeforeLockdown.status).toBe(200);

    const deactivate = await routeFetch(
      "https://dispatch.integration.test/api/operations/publication-lockdown",
      {
        method: "PUT",
        headers: {
          cookie: operatorCookie,
          origin: "https://dispatch.integration.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ enabled: false }),
      },
    );
    expect(deactivate.status).toBe(200);
    expect(await deactivate.json()).toMatchObject({
      publicationLockdown: { enabled: false, version: 2, changedBySubject: "dispatch-operator" },
    });

    const releaseResponse = await releaseWithEditorialSession(
      created.publication.id,
      ready.originLink.version,
      "Explicitly release the approved revision.",
      editorialCookiePair,
    );
    expect(releaseResponse.status).toBe(200);
    const release = await releaseResponse.json() as {
      publication: { lifecycleState: string };
      originLink: { version: number };
    };
    expect(release.publication.lifecycleState).toBe("published");
    expect((await routeFetch(
      "https://dispatch.integration.test/api/public/publications/phase-eleven-lockdown-acceptance",
    )).status).toBe(200);
    expect((await sitemap()).map((entry) => entry.url)).toContain(
      "https://dispatch.integration.test/publications/phase-eleven-lockdown-acceptance",
    );

    const { SqlitePublicationRepository } = await import("@/publications/repository");
    const repository = new SqlitePublicationRepository(databasePath, { migrate: false });
    const lockdownEvents = repository.database.prepare(`
      SELECT action, actor_subject, resulting_version
      FROM operational_audit_events
      WHERE control_name = 'publication-lockdown' ORDER BY resulting_version
    `).all();
    expect(lockdownEvents).toEqual([
      expect.objectContaining({
        action: "publication_lockdown.activated",
        actor_subject: "dispatch-operator",
        resulting_version: 1,
      }),
      expect.objectContaining({
        action: "publication_lockdown.deactivated",
        actor_subject: "dispatch-operator",
        resulting_version: 2,
      }),
    ]);
    expect(repository.database.prepare(`
      SELECT action, actor_subject, resulting_version, timestamp
      FROM audit_events WHERE publication_id = ? AND action = 'publication.release'
    `).get(created.publication.id)).toMatchObject({
      action: "publication.release",
      actor_subject: "dispatch-editorial-service",
      resulting_version: release.originLink.version,
      timestamp: expect.any(String),
    });
    repository.close();
  });
});
