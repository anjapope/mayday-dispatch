"use client";

import { useState, type FormEvent } from "react";

type Props = {
  publicationId: string;
  version: number;
  lifecycleState: string;
  canAuthorizeRelease: boolean;
  releasedAt?: string;
  releaseVersion?: number;
  releaseDigest?: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  body: string[];
  blocks: unknown[];
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
  const [revisionType, setRevisionType] = useState<"correction" | "substantive-update">("correction");
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const publicRevision = props.lifecycleState === "published" || props.lifecycleState === "updated";

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
    let blocks: unknown;
    try {
      sources = JSON.parse(String(form.get("sources")));
      blocks = JSON.parse(String(form.get("blocks")));
    } catch {
      setMessage("VALIDATION_FAILED: Citations and structured blocks must be valid JSON.");
      return;
    }
    const correctionNote = form.get("correctionNote");
    const updateNote = form.get("updateNote");
    await request(`/api/editorial/publications/${props.publicationId}`, "PATCH", {
      expectedVersion: version,
      revisionSummary: publicRevision
        ? String(revisionType === "correction" ? correctionNote : updateNote)
        : "Editorial content update.",
      ...(publicRevision
        ? revisionType === "correction"
          ? {
              revisionType,
              correctionNote,
              correctionExplanation: form.get("correctionExplanation") || undefined,
            }
          : {
              revisionType,
              updateNote,
              updateExplanation: form.get("updateExplanation") || undefined,
            }
        : {}),
      title: form.get("title"),
      subtitle: form.get("subtitle") || undefined,
      excerpt: form.get("excerpt"),
      body: String(form.get("body")).split("\n").map((paragraph) => paragraph.trim()).filter(Boolean),
      blocks,
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
      {publicRevision && (
        <div className="editorial-release-status" role="status" aria-live="polite">
          {props.releaseVersion === undefined
            ? <p>This legacy publication has no Phase 12 release manifest. It is not publicly served until a publisher explicitly re-releases it.</p>
            : <>
                <p>Public release: version {props.releaseVersion}{props.releasedAt ? <> · <time dateTime={props.releasedAt}>{props.releasedAt}</time></> : null}.</p>
                <p>SHA-256: <code>{props.releaseDigest}</code></p>
                {props.releaseVersion !== version && <p role="alert">Version {version} is staged and private. A publisher must review readiness and authorize its release before these changes become public.</p>}
              </>}
        </div>
      )}
      <form className="editorial-form" onSubmit={submitEdit}>
        <label>Title<input name="title" defaultValue={props.title} required /></label>
        <label>Subtitle<input name="subtitle" defaultValue={props.subtitle} /></label>
        <label>Summary<textarea name="excerpt" defaultValue={props.excerpt} required /></label>
        <label>Body paragraphs<textarea name="body" defaultValue={props.body.join("\n")} required /></label>
        <label>Structured blocks (JSON, ordered)<textarea name="blocks" defaultValue={JSON.stringify(props.blocks, null, 2)} aria-describedby="blocks-help" required /></label>
        <p id="blocks-help">Each block requires a type and stable UUID. Validation rejects unsafe URLs, malformed tables, inaccessible images, and invalid map coordinates.</p>
        <label>Tags (comma-separated)<input name="tags" defaultValue={props.tags.join(", ")} /></label>
        <label>Visibility<select name="visibility" defaultValue={props.visibility}><option>private</option><option>internal</option><option>citation-only</option><option>public</option></select></label>
        <label>Public methodology<textarea name="methodology" defaultValue={props.methodology} /></label>
        <label>Public caveat<textarea name="caveat" defaultValue={props.caveat} /></label>
        <label>Citations (JSON)<textarea name="sources" defaultValue={JSON.stringify(props.sources, null, 2)} required /></label>
        {publicRevision && (
          <fieldset>
            <legend>Revision classification and public notice</legend>
            <label>Revision type
              <select
                name="revisionType"
                value={revisionType}
                onChange={(event) => setRevisionType(
                  event.target.value === "substantive-update" ? "substantive-update" : "correction",
                )}
              >
                <option value="correction">Correction</option>
                <option value="substantive-update">Substantive update</option>
              </select>
            </label>
            {revisionType === "correction" ? <>
              <label>Correction note<textarea name="correctionNote" required /></label>
              <label>Correction explanation<textarea name="correctionExplanation" /></label>
            </> : <>
              <label>Update note<textarea name="updateNote" required /></label>
              <label>Update explanation<textarea name="updateExplanation" /></label>
            </>}
          </fieldset>
        )}
        <button disabled={pending} type="submit">Save editorial edit</button>
      </form>
      {publicRevision && <p>Saving a correction or substantive update only stages a revision. Nothing becomes public until a publisher or administrator explicitly authorizes release.</p>}
      <div className="lifecycle-actions">
        {transitions[props.lifecycleState]?.map((to) => (
          <button key={to} disabled={pending || ((to === "published" || to === "updated") && !props.canAuthorizeRelease)} onClick={() => request(
            `/api/editorial/publications/${props.publicationId}/transition`,
            "POST",
            { to, expectedVersion: version, revisionSummary: `Editorial transition to ${to}.`, ...(to === "archived" ? { reason: "Archived by Dispatch editorial control." } : {}) },
          )} type="button">
            {to === "published" && "Authorize initial public release"}
            {to === "updated" && "Authorize release of this revision"}
            {to !== "published" && to !== "updated" && `Move to ${to}`}
          </button>
        ))}
      </div>
      {message && <p className="editorial-message" role="status">{message}</p>}
    </section>
  );
}
