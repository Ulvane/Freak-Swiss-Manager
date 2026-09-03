"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

type Mode = "login" | "register";

export function AuthPanel({ returnTo }: { returnTo: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      setWorking(false);
      return;
    }

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email") || ""),
          password,
          displayName: String(data.get("displayName") || ""),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error || "Unable to continue.");
        return;
      }

      const safeReturnTo =
        returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
      window.location.assign(safeReturnTo);
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="auth-shell">
      <aside className="brand-rail auth-brand-rail" aria-label="Freak Swiss Manager">
        <span className="brand-monogram">FS</span>
        <span className="brand-index">01</span>
        <span className="brand-vertical">INDEPENDENT TOURNAMENT CONTROL</span>
      </aside>

      <section className="auth-stage">
        <Link className="auth-back" href="/">
          <ArrowLeft /> Back to tournaments
        </Link>
        <div className="auth-card">
          <p className="section-code">ACCOUNT / FREAK SWISS</p>
          <h1>{mode === "login" ? "Enter the control desk." : "Create your account."}</h1>
          <p className="auth-intro">
            {mode === "login"
              ? "Use your independent Freak Swiss account."
              : "Players can register freely. Moderator access is granted later with a single-use tournament token."}
          </p>

          <div className="auth-mode" role="tablist" aria-label="Account action">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "is-active" : ""}
              onClick={() => {
                setMode("login");
                setError(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "is-active" : ""}
              onClick={() => {
                setMode("register");
                setError(null);
              }}
            >
              Register
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <label>
                Display name
                <input name="displayName" autoComplete="name" maxLength={80} required />
              </label>
            )}
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={10}
                maxLength={128}
                required
              />
              {mode === "register" && <small>At least 10 characters.</small>}
            </label>
            {mode === "register" && (
              <>
                <label>
                  Confirm password
                  <input
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={128}
                    required
                  />
                </label>
              </>
            )}

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button className="auth-submit" type="submit" disabled={working}>
              {mode === "login" ? "Sign in" : "Create account"}
              {working ? <span aria-hidden="true">…</span> : <ArrowRight />}
            </button>
          </form>

          <div className="auth-security-note">
            <ShieldCheck />
            <p>
              Passwords are salted and hashed. Sign-in sessions are stored as
              one-way token hashes and automatically expire.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
