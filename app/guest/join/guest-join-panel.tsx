"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck, UserMinus } from "lucide-react";
import Link from "next/link";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { saveGuestRegistration } from "@/lib/guest-storage";

type JoinResult = {
  tournamentId: string;
  playerId: string;
  guestToken: string;
  guestTokenExpiresAt: string;
};

export function GuestJoinPanel({ prefillCode }: { prefillCode: string }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JoinResult | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);
  const [name, setName] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const playerName = String(data.get("name") || "").trim();

    try {
      const response = await fetch("/api/guest/join-tournament", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          joinCode: String(data.get("joinCode") || ""),
          name: playerName,
          fideId: String(data.get("fideId") || ""),
          rating: Number(data.get("rating") || 0),
        }),
      });
      const parsed = (await response.json().catch(() => ({}))) as JoinResult & {
        error?: string;
      };
      if (!response.ok) {
        setError(parsed.error || "Unable to join this tournament.");
        return;
      }

      saveGuestRegistration({
        tournamentId: parsed.tournamentId,
        playerId: parsed.playerId,
        token: parsed.guestToken,
        name: playerName,
        expiresAt: parsed.guestTokenExpiresAt,
      });
      setName(playerName);
      setResult(parsed);
    } catch {
      setError("Unable to reach the server. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  async function withdraw() {
    if (!result) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/player/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tournamentId: result.tournamentId,
          guestToken: result.guestToken,
          confirm: true,
        }),
      });
      const parsed = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(parsed.error || "Unable to withdraw right now.");
        return;
      }
      setWithdrawn(true);
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
        <span className="brand-index">02</span>
        <span className="brand-vertical">ACCOUNTLESS TOURNAMENT ENTRY</span>
      </aside>
      <section className="auth-stage">
        <Link className="auth-back" href="/">
          <ArrowLeft /> Back to tournaments
        </Link>
        <div className="auth-card">
          <p className="section-code">JOIN / FREAK SWISS</p>
          <h1>
            {result ? "You're registered." : "Join a tournament with a code."}
          </h1>
          <p className="auth-intro">
            {result
              ? "Save this page or write down your access code below. It is the only way to manage your own registration later."
              : "No account, password, or email required. Enter the tournament code shared by the organizer and your player details."}
          </p>

          {!result && (
            <form className="auth-form" onSubmit={submit}>
              <label>
                Tournament code
                <input
                  name="joinCode"
                  defaultValue={prefillCode}
                  autoCapitalize="characters"
                  maxLength={12}
                  required
                />
              </label>
              <label>
                Name
                <input name="name" autoComplete="name" maxLength={100} required />
              </label>
              <label>
                FIDE ID (optional)
                <input name="fideId" maxLength={24} />
              </label>
              <label>
                Rating
                <input
                  name="rating"
                  type="number"
                  min={0}
                  max={4000}
                  defaultValue={1500}
                />
              </label>

              {error && <p className="auth-error" role="alert">{error}</p>}

              <button className="auth-submit" type="submit" disabled={working}>
                Join tournament
                {working ? <span aria-hidden="true">…</span> : <ArrowRight />}
              </button>
            </form>
          )}

          {result && !withdrawn && (
            <div className="auth-form">
              <label>
                Your access code
                <input readOnly value={result.guestToken} />
              </label>
              <small>
                Keep this code private. Anyone with it can manage {name || "your"}{" "}
                registration. It expires on{" "}
                {new Date(result.guestTokenExpiresAt).toLocaleDateString()}.
              </small>

              {error && <p className="auth-error" role="alert">{error}</p>}

              <div className="guest-actions">
                <Link className="auth-submit" href={`/?t=${result.tournamentId}`}>
                  View tournament <ArrowRight />
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button type="button" className="auth-withdraw" disabled={working}>
                      <UserMinus /> Withdraw from tournament
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="confirmation-dialog">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Withdraw from this tournament?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your previous games and results stay in the tournament
                        history, but you will not be paired in future rounds.
                        Tournament staff can restore you later if allowed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Stay registered</AlertDialogCancel>
                      <AlertDialogAction onClick={withdraw} disabled={working}>
                        Withdraw
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}

          {withdrawn && (
            <p className="auth-intro">
              You have withdrawn from this tournament. Your historical results
              remain visible on the standings page.
            </p>
          )}

          <div className="auth-security-note">
            <ShieldCheck />
            <p>
              Guest access codes are stored as one-way hashes on the server
              and are scoped to this tournament and player only.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
