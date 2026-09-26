"use client";

import { useState, type FormEvent } from "react";

export function EditorialSignIn() {
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("credential") ?? "").trim();
    setPending(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/editorial/session", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        setMessage(payload.error?.message ?? "Sign-in was rejected.");
        return;
      }
      window.location.assign("/editorial");
    } catch {
      setMessage("The sign-in request could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="editorial-form" onSubmit={signIn}>
      <label>
        Dispatch account credential
        <input name="credential" type="password" autoComplete="current-password" required />
      </label>
      <button disabled={pending} type="submit">{pending ? "Signing in…" : "Sign in"}</button>
      {message && <p className="editorial-message" role="alert">{message}</p>}
    </form>
  );
}
