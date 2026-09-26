"use client";

import { useState, type FormEvent } from "react";

type Props = {
  publicationId: string;
  version: number;
  lifecycleState: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  body: string[];
  tags: string[];
  visibility: string;
  sources: unknown[];
  methodology?: string;
  caveat?: string;
};

const transitions: Record<string, string[]> = {
  draft: ["review", "archived"],
  review: ["draft", "ready", "archived"],
  ready: ["review", "published", "archived"],
  published: ["updated", "archived"],
  updated: ["updated", "archived"],
  archived: [],
};

export function EditorialControls(props: Props) {
  const [version, setVersion] = useState(props.version);
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function request(path: string, method: "PATCH" | "POST", body: Record<string, unknown>) {
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as {
        publication?: { revision: { version: number }; lifecycleState: string };
        error?: { code: string; message: string };
      };
      if (!response.ok || !payload.publication) {
        setMessage(`${payload.error?.code ?? "REQUEST_FAILED"}: ${payload.error?.message ?? "The editorial request failed."}`);
        return;
      }
      setVersion(payload.publication.revision.version);
      setMessage(`Saved version ${payload.publication.revision.version}. Refresh the workspace to view the updated record.`);
    } catch {
      setMessage("NETWORK_ERROR: The editorial request could not be completed.");
    } finally {
      setPending(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let sources: unknown;
    try {
      sources = JSON.parse(String(form.get("sources")));
    } catch {
      setMessage("VALIDATION_FAILED: Citations must be valid JSON.");
      return;
    }
    await request(`/api/editorial/publications/${props.publicationId}`, "PATCH", {
      expectedVersion: version,
      revisionSummary: "Editorial content update.",
      title: form.get("title"),
      subtitle: form.get("subtitle") || undefined,
      excerpt: form.get("excerpt"),
      body: String(form.get("body")).split("\n").map((paragraph) => paragraph.trim()).filter(Boolean),
      tags: String(form.get("tags")).split(",").map((tag) => tag.trim()).filter(Boolean),
      visibility: form.get("visibility"),
      sources,
      methodology: form.get("methodology") || undefined,
      caveat: form.get("caveat") || undefined,
    });
  }

  return (
    <section className="editorial-panel" aria-labelledby="editorial-controls-heading">
      <h2 id="editorial-controls-heading">Editorial controls</h2>
      <p>All actions use optimistic concurrency at version {version}.</p>
      <form className="editorial-form" onSubmit={submitEdit}>
        <label>Title<input name="title" defaultValue={props.title} required /></label>
        <label>Subtitle<input name="subtitle" defaultValue={props.subtitle} /></label>
        <label>Summary<textarea name="excerpt" defaultValue={props.excerpt} required /></label>
        <label>Body paragraphs<textarea name="body" defaultValue={props.body.join("\n")} required /></label>
        <label>Tags (comma-separated)<input name="tags" defaultValue={props.tags.join(", ")} /></label>
        <label>Visibility<select name="visibility" defaultValue={props.visibility}><option>private</option><option>internal</option><option>citation-only</option><option>public</option></select></label>
        <label>Public methodology<textarea name="methodology" defaultValue={props.methodology} /></label>
        <label>Public caveat<textarea name="caveat" defaultValue={props.caveat} /></label>
        <label>Citations (JSON)<textarea name="sources" defaultValue={JSON.stringify(props.sources, null, 2)} required /></label>
        <button disabled={pending} type="submit">Save editorial edit</button>
      </form>
      <div className="lifecycle-actions">
        {transitions[props.lifecycleState]?.map((to) => (
          <button key={to} disabled={pending} onClick={() => request(
            `/api/editorial/publications/${props.publicationId}/transition`,
            "POST",
            { to, expectedVersion: version, revisionSummary: `Editorial transition to ${to}.`, ...(to === "archived" ? { reason: "Archived by Dispatch editorial control." } : {}) },
          )} type="button">
            Move to {to}
          </button>
        ))}
      </div>
      {message && <p className="editorial-message" role="status">{message}</p>}
    </section>
  );
}
