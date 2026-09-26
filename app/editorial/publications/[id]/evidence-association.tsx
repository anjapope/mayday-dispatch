"use client";

import { useState } from "react";

type EvidenceResult = { id: string; title: string; status: string; visibility: string };

export function EvidenceAssociation({ publicationId, version }: { publicationId: string; version: number }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<EvidenceResult[]>([]);
  const [message, setMessage] = useState<string>();

  async function search() {
    const response = await fetch(`/api/evidence?query=${encodeURIComponent(query)}`);
    const payload = await response.json() as { evidence?: EvidenceResult[]; error?: { message: string } };
    if (!response.ok) return setMessage(payload.error?.message ?? "Evidence search failed.");
    setMatches(payload.evidence ?? []);
  }

  async function attach(evidenceId: string) {
    const response = await fetch(`/api/publications/${publicationId}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evidenceId, expectedVersion: version, revisionSummary: "Existing evidence associated from Evidence Library." }),
    });
    const payload = await response.json() as { error?: { message: string } };
    setMessage(response.ok ? "Evidence associated. Refresh the workspace to see the new revision." : payload.error?.message ?? "Evidence association failed.");
  }

  return <section className="editorial-panel" aria-labelledby="associate-evidence-heading">
    <h2 id="associate-evidence-heading">Add existing evidence</h2>
    <p>Search the Evidence Library and associate its stable identity; no evidence is cloned.</p>
    <label>Search Evidence Library<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <button type="button" onClick={search}>Search evidence</button>
    <ul className="evidence-list">
      {matches.map((evidence) => <li key={evidence.id}>
        <strong>{evidence.title}</strong> — {evidence.status} / {evidence.visibility}
        <button type="button" onClick={() => attach(evidence.id)}>Associate</button>
      </li>)}
    </ul>
    {message && <p className="editorial-message" role="status">{message}</p>}
  </section>;
}
