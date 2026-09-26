"use client";

import { useState } from "react";

export function PublicationLockdownControl({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function setLockdown(nextValue: boolean) {
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/operations/publication-lockdown", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: nextValue }),
      });
      const payload = await response.json() as {
        publicationLockdown?: { enabled: boolean };
        error?: { message?: string };
      };
      if (!response.ok || !payload.publicationLockdown) {
        setMessage(payload.error?.message ?? "The lockdown control could not be updated.");
        return;
      }
      setEnabled(payload.publicationLockdown.enabled);
      setMessage(payload.publicationLockdown.enabled
        ? "Lockdown is active. Existing public content remains available."
        : "Lockdown is inactive.");
    } catch {
      setMessage("The lockdown request could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="editorial-panel" aria-label="Publication lockdown control">
      <p role="status">Status: {enabled ? "active" : "inactive"}</p>
      <button disabled={pending} onClick={() => setLockdown(!enabled)} type="button">
        {enabled ? "Deactivate lockdown" : "Activate lockdown"}
      </button>
      {message && <p className="editorial-message" role="status">{message}</p>}
    </section>
  );
}
