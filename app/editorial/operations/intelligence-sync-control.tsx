"use client";

import { useState } from "react";

export function IntelligenceSyncControl({ initial }: { initial: Record<string, unknown> }) {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(false);
  const pause = state.paused === 1;
  async function action(action: "pause" | "resume" | "sync") {
    setPending(true);
    try {
      await fetch("/api/operations/intelligence-sync", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
      });
      const response = await fetch("/api/operations/intelligence-sync", { cache: "no-store" });
      setState((await response.json()).state);
    } finally { setPending(false); }
  }
  return <section>
    <h2>Intelligence synchronization</h2>
    <p>Worker: {String(state.status)} · Provider: {String(state.status)} · Failures: {String(state.consecutive_failures ?? 0)}</p>
    <p>Last success: {String(state.last_successful_sync_at ?? "never")} · Next run: {String(state.next_run_at ?? "not scheduled")}</p>
    <button disabled={pending} onClick={() => void action(pause ? "resume" : "pause")}>{pause ? "Resume synchronization" : "Pause synchronization"}</button>
    <button disabled={pending || pause} onClick={() => void action("sync")}>Run bounded sync</button>
  </section>;
}
