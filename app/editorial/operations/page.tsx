import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { actorFromRequest } from "@/application/publication-gateway/http";
import { getPublicationRepository } from "@/publications/repository";
import { PublicationLockdownControl } from "./publication-lockdown-control";
import { IntelligenceSyncControl } from "./intelligence-sync-control";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Operational controls | The Golden Horn",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function OperationsPage() {
  const requestHeaders = await headers();
  const actor = await actorFromRequest(new Request("http://dispatch.internal/editorial/operations", {
    headers: requestHeaders,
  }));
  if (!actor) {
    return <main className="shell"><h1>Operations sign-in required</h1><p><Link href="/editorial/sign-in">Sign in</Link> with a configured operations account.</p></main>;
  }
  if (!actor.roles.includes("operator")) {
    return <main className="shell"><h1>Operations access denied</h1><p>This control requires the separate operator role.</p></main>;
  }
  const control = await getPublicationRepository().getPublicationLockdown?.();
  if (!control) {
    throw new Error("Operational controls are unavailable.");
  }
  const database = getPublicationRepository() as { database?: { prepare(sql: string): { get(): Record<string, unknown> | undefined } } };
  const syncState = database.database?.prepare("SELECT * FROM intelligence_sync_worker_state WHERE worker_name = 'intelligence-sync'").get();
  return (
    <main className="shell detail">
      <p className="eyebrow">Dispatch / Operations</p>
      <h1>Publication lockdown</h1>
      <p>Lockdown blocks new public releases and updates without removing material already published.</p>
      <PublicationLockdownControl initiallyEnabled={control.enabled} />
      {syncState && <IntelligenceSyncControl initial={syncState} />}
    </main>
  );
}
