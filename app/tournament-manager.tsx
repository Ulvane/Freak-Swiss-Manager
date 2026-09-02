"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Crown,
  FlaskConical,
  KeyRound,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  ShieldPlus,
  Trash2,
  Trophy,
  Undo2,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import {
  applyPairingResult,
  countPendingResults,
  pairingsForRound,
  type EnterableResult,
} from "@/lib/result-workflow";
import type {
  ManagerPayload,
  Pairing,
  Player,
  ResultCode,
  Standing,
  Tournament,
  TournamentSummary,
} from "@/lib/tournament-types";

type Props = {
  signInPath: string;
  signOutPath: string;
};

const emptyPayload: ManagerPayload = {
  serverTime: "1970-01-01T00:00:00.000Z",
  authenticated: false,
  viewerName: null,
  viewerEmail: null,
  viewerGlobalRole: "visitor",
  canCreateTournament: false,
  tournaments: [],
  openTournaments: [],
  snapshot: null,
  accounts: [],
  moderators: [],
  moderatorTokens: [],
};

function score(value: number) {
  return value.toFixed(1);
}

function statusLabel(status: string) {
  if (status === "between_rounds") return "Round complete";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function resultLabel(result: ResultCode) {
  if (result === "*") return "—";
  if (result === "1-BYE") return "1–0 BYE";
  if (result === "1F-0F") return "1–0 · black no-show";
  if (result === "0F-1F") return "0–1 · white no-show";
  if (result === "0F-0F") return "0–0 · double no-show";
  return result.replaceAll("-", "–");
}

function isNoShowResult(result: ResultCode) {
  return result === "1F-0F" || result === "0F-1F" || result === "0F-0F";
}

export function TournamentManager({ signInPath, signOutPath }: Props) {
  const [payload, setPayload] = useState<ManagerPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [savingResultIds, setSavingResultIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showLibrary, setShowLibrary] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [moderatorRedeemOpen, setModeratorRedeemOpen] = useState(false);
  const [moderatorTokenInput, setModeratorTokenInput] = useState("");
  const [moderatorInviteOpen, setModeratorInviteOpen] = useState(false);
  const [issuedModeratorToken, setIssuedModeratorToken] = useState<string | null>(null);
  const [joinTargetName, setJoinTargetName] = useState<string | null>(null);
  const [managePlayerId, setManagePlayerId] = useState<string | null>(null);
  const [roundView, setRoundView] = useState<{
    tournamentId: string;
    round: number;
  } | null>(null);
  const [tournamentForm, setTournamentForm] = useState({
    name: "",
    city: "",
    rounds: 5,
  });
  const [playerForm, setPlayerForm] = useState({
    name: "",
    fideId: "",
    rating: 1500,
  });
  const [joinForm, setJoinForm] = useState({
    tournamentId: "",
    joinCode: "",
    name: "",
    fideId: "",
    rating: 1500,
  });

  const load = useCallback(async (tournamentId?: string | null) => {
    try {
      const query = tournamentId ? `?t=${encodeURIComponent(tournamentId)}` : "";
      const response = await fetch(`/api/manager${query}`, { cache: "no-store" });
      const data = (await response.json()) as ManagerPayload & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load tournament");
      setPayload(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load tournament");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tournamentId = new URLSearchParams(window.location.search).get("t");
    const timer = window.setTimeout(() => {
      setShowLibrary(!tournamentId);
      void load(tournamentId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const mutate = useCallback(
    async (body: Record<string, unknown>, successMessage: string) => {
      setWorking(true);
      try {
        const response = await fetch("/api/manager", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as {
          error?: string;
          tournamentId?: string;
          deletedTournamentId?: string;
        };
        if (!response.ok) throw new Error(data.error || "Request failed");
        if (data.deletedTournamentId) {
          window.history.replaceState({}, "", window.location.pathname);
          setShowLibrary(true);
          await load();
        } else if (data.tournamentId) {
          window.history.replaceState({}, "", `?t=${data.tournamentId}`);
          setShowLibrary(false);
          await load(data.tournamentId);
        } else {
          await load();
        }
        toast.success(successMessage);
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Request failed");
        return false;
      } finally {
        setWorking(false);
      }
    },
    [load],
  );

  const snapshot = payload.snapshot;
  const tournament = snapshot?.tournament;
  const managedPlayer =
    snapshot?.players.find((player) => player.id === managePlayerId) ?? null;
  const currentPairings = useMemo(
    () => pairingsForRound(snapshot?.pairings ?? [], tournament?.currentRound ?? 0),
    [snapshot, tournament?.currentRound],
  );
  const viewedRound = tournament
    ? roundView?.tournamentId === tournament.id &&
      roundView.round >= 1 &&
      roundView.round <= tournament.currentRound
      ? roundView.round
      : tournament.currentRound
    : 0;
  const viewedPairings = useMemo(
    () => pairingsForRound(snapshot?.pairings ?? [], viewedRound),
    [snapshot, viewedRound],
  );
  const remainingResults = countPendingResults(currentPairings);
  const activePlayerCount = snapshot?.players.filter((player) => !player.withdrawn).length ?? 0;
  const uncheckedPlayerCount =
    snapshot?.players.filter((player) => !player.withdrawn && !player.checkedIn).length ?? 0;
  const canGenerate = Boolean(
    snapshot?.canEdit &&
      tournament &&
      activePlayerCount >= 2 &&
      (tournament.currentRound > 0 || uncheckedPlayerCount === 0) &&
      remainingResults === 0 &&
      savingResultIds.size === 0 &&
      tournament.currentRound < tournament.rounds,
  );

  async function saveResult(pairing: Pairing, result: EnterableResult) {
    if (
      !tournament ||
      pairing.result === result ||
      savingResultIds.has(pairing.id)
    ) {
      return;
    }

    const tournamentId = tournament.id;
    const previousResult = pairing.result;
    setSavingResultIds((current) => new Set(current).add(pairing.id));
    setPayload((current) =>
      current.snapshot
        ? {
            ...current,
            snapshot: applyPairingResult(
              current.snapshot,
              pairing.id,
              result,
            ),
          }
        : current,
    );

    try {
      const response = await fetch("/api/manager", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set_result",
          tournamentId,
          pairingId: pairing.id,
          result,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to save result");
    } catch (error) {
      setPayload((current) =>
        current.snapshot
          ? {
              ...current,
              snapshot: applyPairingResult(
                current.snapshot,
                pairing.id,
                previousResult,
              ),
            }
          : current,
      );
      toast.error(
        error instanceof Error ? error.message : "Unable to save result",
      );
    } finally {
      setSavingResultIds((current) => {
        const next = new Set(current);
        next.delete(pairing.id);
        return next;
      });
    }
  }

  async function createTournament(event: FormEvent) {
    event.preventDefault();
    const created = await mutate(
      { action: "create_tournament", ...tournamentForm },
      "Tournament created",
    );
    if (created) {
      setCreateOpen(false);
      setTournamentForm({ name: "", city: "", rounds: 5 });
    }
  }

  async function addPlayer(event: FormEvent) {
    event.preventDefault();
    if (!tournament) return;
    const added = await mutate(
      {
        action: "add_player",
        tournamentId: tournament.id,
        ...playerForm,
      },
      "Player registered",
    );
    if (added) setPlayerForm({ name: "", fideId: "", rating: 1500 });
  }

  async function chooseTournament(tournamentId: string) {
    window.history.replaceState({}, "", `?t=${tournamentId}`);
    setShowLibrary(false);
    await load(tournamentId);
  }

  function openLibrary() {
    window.history.replaceState({}, "", window.location.pathname);
    setShowLibrary(true);
  }

  function openJoinDialog(tournamentItem?: TournamentSummary) {
    setJoinTargetName(tournamentItem?.name ?? null);
    setJoinForm({
      tournamentId: tournamentItem?.id ?? "",
      joinCode: "",
      name: payload.viewerName ?? "",
      fideId: "",
      rating: 1500,
    });
    setJoinOpen(true);
  }

  async function joinTournament(event: FormEvent) {
    event.preventDefault();
    const joined = await mutate(
      { action: "join_tournament", ...joinForm },
      "You joined the tournament",
    );
    if (joined) setJoinOpen(false);
  }

  async function redeemModeratorToken(event: FormEvent) {
    event.preventDefault();
    const redeemed = await mutate(
      { action: "redeem_moderator_token", token: moderatorTokenInput },
      "Moderator access activated",
    );
    if (redeemed) {
      setModeratorTokenInput("");
      setModeratorRedeemOpen(false);
    }
  }

  async function issueModeratorToken(tournamentId?: string) {
    setWorking(true);
    try {
      const response = await fetch("/api/manager", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_moderator_token", tournamentId }),
      });
      const data = (await response.json()) as { error?: string; moderatorToken?: string };
      if (!response.ok || !data.moderatorToken) {
        throw new Error(data.error || "Unable to create moderator token");
      }
      setIssuedModeratorToken(data.moderatorToken);
      setModeratorInviteOpen(true);
      await load();
      toast.success("Single-use moderator token created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create token");
    } finally {
      setWorking(false);
    }
  }

  async function copyShareLink() {
    if (!tournament) return;
    const url = new URL(window.location.href);
    url.search = `?t=${tournament.id}`;
    await navigator.clipboard.writeText(url.href);
    toast.success("Public tournament link copied");
  }

  async function copyJoinCode() {
    if (!tournament?.joinCode) return;
    await navigator.clipboard.writeText(tournament.joinCode);
    toast.success("Join code copied");
  }

  if (loading) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="loading-mark">FS</div>
        <p>Loading control desk…</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Toaster position="bottom-right" />

      <aside className="brand-rail" aria-label="Freak Swiss Manager">
        <span className="brand-monogram">FS</span>
        <span className="brand-index">01</span>
        <span className="brand-vertical">OPEN SWISS TOURNAMENT CONTROL</span>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="wordmark wordmark-button" type="button" onClick={openLibrary}>
            Freak<span>Swiss</span> Manager
          </button>
          <div className="topbar-meta">
            <span className="beta-tag">OPEN BETA</span>
            <a className="text-link audit-link" href="/benchmark">
              <FlaskConical /> Pairing audit
            </a>
            {payload.authenticated ? (
              <>
                <span className={`role-badge role-${payload.viewerGlobalRole}`}>
                  {payload.viewerGlobalRole === "superadmin"
                    ? "SUPERADMIN"
                    : payload.viewerGlobalRole.toUpperCase()}
                </span>
                <span className="viewer-name">{payload.viewerName}</span>
                <a className="text-link" href={signOutPath}>
                  Sign out
                </a>
              </>
            ) : (
              <a className="signin-link" href={signInPath} target="_top">
                Sign in <ArrowRight />
              </a>
            )}
          </div>
        </header>

        {showLibrary || !snapshot ? (
          <TournamentLibrary
            payload={payload}
            createOpen={createOpen}
            setCreateOpen={setCreateOpen}
            signInPath={signInPath}
            tournamentForm={tournamentForm}
            setTournamentForm={setTournamentForm}
            createTournament={createTournament}
            working={working}
            onOpenTournament={chooseTournament}
            onJoinTournament={openJoinDialog}
            onRedeemModerator={() => setModeratorRedeemOpen(true)}
            onDeleteModerator={(email) =>
              mutate({ action: "delete_moderator", email }, "Moderator removed")
            }
            onDeleteAccount={(email) =>
              mutate({ action: "delete_account", email }, "Account deleted")
            }
            onRevokeModeratorToken={(tokenId) =>
              mutate({ action: "revoke_moderator_token", tokenId }, "Moderator token revoked")
            }
            onDeleteModeratorToken={(tokenId) =>
              mutate({ action: "delete_moderator_token", tokenId }, "Moderator token deleted")
            }
            onCreateTestTournament={() =>
              mutate({ action: "create_test_tournament" }, "2700chess Top 64 test created")
            }
            onRefresh={() => load()}
            onDeleteTournament={(item) =>
              mutate(
                { action: "delete_tournament", tournamentId: item.id },
                `${item.name} deleted`,
              )
            }
          />
        ) : (
          <>
            <section className="control-heading">
              <div>
                <p className="section-code">TOURNAMENT / CONTROL DESK</p>
                <span className={`role-badge role-${snapshot.viewerRole}`}>
                  {snapshot.viewerRole === "superadmin"
                    ? "SUPERADMIN"
                    : snapshot.viewerRole === "moderator"
                      ? "MODERATOR"
                    : snapshot.viewerRole === "player"
                      ? "PLAYER"
                      : "VIEWER"}
                </span>
                <h1>{tournament?.name}</h1>
                <p className="tournament-location">
                  {tournament?.city || "Location not set"}
                  <span aria-hidden="true">↗</span>
                  Server-persisted
                </p>
              </div>
              <div className="heading-actions">
                <Button variant="outline" onClick={openLibrary}>
                  <BookOpen /> All tournaments
                </Button>
                {payload.authenticated && payload.tournaments.length > 0 && (
                  <Select value={tournament?.id} onValueChange={chooseTournament}>
                    <SelectTrigger className="tournament-switcher">
                      <SelectValue placeholder="Select tournament" />
                    </SelectTrigger>
                    <SelectContent
                      className="tournament-switcher-content"
                      position="popper"
                      align="end"
                      sideOffset={6}
                    >
                      {payload.tournaments.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" onClick={copyShareLink}>
                  <Copy /> Share
                </Button>
                {snapshot.canDeleteTournament && tournament && (
                  <DeleteTournamentDialog
                    tournament={tournament}
                    working={working}
                    onDelete={() =>
                      mutate(
                        {
                          action: "delete_tournament",
                          tournamentId: tournament.id,
                        },
                        `${tournament.name} deleted`,
                      )
                    }
                  />
                )}
                {snapshot.canJoin && (
                  <Button
                    onClick={() =>
                      openJoinDialog({
                        ...tournament!,
                        playerCount: snapshot.players.length,
                        role: "visitor",
                      })
                    }
                  >
                    <UserPlus /> Join
                  </Button>
                )}
                {!payload.authenticated &&
                  tournament?.registrationOpen &&
                  tournament.currentRound === 0 && (
                    <a className="signin-link join-signin" href={signInPath} target="_top">
                      Sign in to join <ArrowRight />
                    </a>
                  )}
                {payload.canCreateTournament && (
                  <CreateTournamentDialog
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    form={tournamentForm}
                    setForm={setTournamentForm}
                    onSubmit={createTournament}
                    working={working}
                  />
                )}
              </div>
            </section>

            {snapshot.canEdit ? (
              <section className="join-strip" aria-label="Player registration controls">
                <div className="join-code-block">
                  <span>PLAYER JOIN CODE</span>
                  <strong>{tournament?.joinCode ?? "—"}</strong>
                </div>
                <p>
                  Share this code. Players sign in, enter it once,
                  and the tournament stays in their library. Before round one,
                  check in every active player.
                </p>
                <div className="join-strip-actions">
                  {tournament?.currentRound === 0 && (
                    <span className={`registration-state ${uncheckedPlayerCount === 0 ? "is-open" : ""}`}>
                      {uncheckedPlayerCount === 0
                        ? "All active players checked in"
                        : `${uncheckedPlayerCount} awaiting check-in`}
                    </span>
                  )}
                  <span
                    className={`registration-state ${
                      tournament?.registrationOpen ? "is-open" : ""
                    }`}
                  >
                    {tournament?.registrationOpen ? "Registration open" : "Registration closed"}
                  </span>
                  <Button variant="outline" onClick={copyJoinCode} disabled={!tournament?.joinCode}>
                    <Copy /> Copy code
                  </Button>
                  <Button
                    variant="outline"
                    disabled={working || Boolean(tournament?.currentRound)}
                    onClick={() =>
                      mutate(
                        {
                          action: "toggle_registration",
                          tournamentId: tournament?.id,
                          open: !tournament?.registrationOpen,
                        },
                        tournament?.registrationOpen
                          ? "Registration closed"
                          : "Registration opened",
                      )
                    }
                  >
                    {tournament?.registrationOpen ? "Close" : "Open"}
                  </Button>
                  {snapshot.canInviteModerators && (
                    <Button
                      variant="outline"
                      disabled={working}
                      onClick={() => void issueModeratorToken(tournament?.id)}
                    >
                      <ShieldPlus /> Add moderator
                    </Button>
                  )}
                </div>
              </section>
            ) : snapshot.viewerRole === "player" ? (
              <section className="join-strip participant-strip">
                <div className="join-code-block">
                  <span>YOUR ROLE</span>
                  <strong>PLAYER</strong>
                </div>
                <p>
                  You are registered. Pairings, results and standings will stay
                  synced to this Freak Swiss account.
                </p>
              </section>
            ) : null}

            {snapshot.canEdit && (
              <section className="moderator-strip" aria-label="Tournament moderators">
                <div>
                  <span className="section-code">TOURNAMENT MODERATORS</span>
                  <strong>
                    {snapshot.moderators.length
                      ? `${snapshot.moderators.length} assigned`
                      : "No delegated moderators"}
                  </strong>
                </div>
                <div className="moderator-chip-list">
                  {snapshot.moderators.map((moderator) => (
                    <span className="moderator-chip" key={moderator.email}>
                      <ShieldCheck /> {moderator.displayName}
                      {snapshot.canRemoveModerators && (
                        <button
                          type="button"
                          aria-label={`Remove ${moderator.displayName} from this tournament`}
                          onClick={() =>
                            mutate(
                              {
                                action: "remove_tournament_moderator",
                                tournamentId: tournament?.id,
                                email: moderator.email,
                              },
                              `${moderator.displayName} removed from tournament`,
                            )
                          }
                        >
                          <UserX />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section className="metric-grid" aria-label="Tournament summary">
              <Metric code="01" label="Players" value={snapshot.players.length} />
              <Metric
                code="02"
                label="Current round"
                value={`${tournament?.currentRound ?? 0}/${tournament?.rounds ?? 0}`}
                accent
              />
              <Metric
                code="03"
                label="Status"
                value={statusLabel(tournament?.status ?? "draft")}
              />
              <Metric
                code="04"
                label="Leader"
                value={snapshot.standings[0]?.name ?? "—"}
              />
            </section>

            <section className="control-grid">
              <div className="round-block">
                <p>ROUND</p>
                <strong>{String(tournament?.currentRound ?? 0).padStart(2, "0")}</strong>
                <span>OF {String(tournament?.rounds ?? 0).padStart(2, "0")}</span>
              </div>

              <div className="data-surface">
                <Tabs
                  key={tournament?.id}
                  defaultValue={tournament?.currentRound ? "pairings" : "players"}
                >
                  <div className="surface-toolbar">
                    <TabsList variant="line" className="swiss-tabs">
                      <TabsTrigger value="pairings">Pairings</TabsTrigger>
                      <TabsTrigger value="standings">Standings</TabsTrigger>
                      <TabsTrigger value="players">Players</TabsTrigger>
                    </TabsList>
                    {snapshot.canEdit && (
                      <div className="round-actions">
                        {snapshot.canDeleteRound && tournament && (
                          <DangerConfirmDialog
                            triggerLabel={`Delete round ${tournament.currentRound}`}
                            title={`Delete round ${tournament.currentRound}?`}
                            description="The latest pairings and results will be removed. Player history from earlier rounds stays intact, so you can fix attendance or withdrawal status and pair the round again."
                            working={working}
                            onConfirm={() =>
                              mutate(
                                { action: "delete_round", tournamentId: tournament.id },
                                `Round ${tournament.currentRound} deleted`,
                              )
                            }
                            icon="undo"
                          />
                        )}
                        {tournament &&
                        tournament.currentRound > 0 &&
                        remainingResults > 0 ? (
                          <span className="results-remaining" aria-live="polite">
                            {remainingResults} result{remainingResults === 1 ? "" : "s"} remaining
                          </span>
                        ) : tournament && savingResultIds.size > 0 ? (
                          <span className="results-remaining is-saving" aria-live="polite">
                            Saving {savingResultIds.size} result
                            {savingResultIds.size === 1 ? "" : "s"}…
                          </span>
                        ) : tournament && tournament.currentRound < tournament.rounds ? (
                          <Button
                            className="pair-button"
                            disabled={!canGenerate || working}
                            onClick={() => {
                              setRoundView(null);
                              void mutate(
                                {
                                  action: "generate_round",
                                  tournamentId: tournament.id,
                                },
                                `Round ${tournament.currentRound + 1} paired`,
                              );
                            }}
                          >
                            {tournament.currentRound === 0
                              ? "Generate round 1"
                              : `Generate round ${tournament.currentRound + 1}`}
                            <ChevronRight />
                          </Button>
                        ) : tournament ? (
                          <span className="results-remaining is-complete">
                            Tournament complete
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <TabsContent value="pairings" className="tab-panel">
                    {tournament && tournament.currentRound > 0 && (
                      <div className="round-archive" aria-label="Tournament round archive">
                        <div className="round-archive-heading">
                          <span>ROUND ARCHIVE</span>
                          <strong>Round {viewedRound} pairings</strong>
                          <small>
                            {viewedRound === tournament.currentRound
                              ? "Current round"
                              : "Completed round · read only"}
                          </small>
                        </div>
                        <div className="round-archive-buttons">
                          {Array.from(
                            { length: tournament.currentRound },
                            (_, index) => index + 1,
                          ).map((round) => (
                            <button
                              key={round}
                              type="button"
                              className={round === viewedRound ? "is-active" : ""}
                              aria-pressed={round === viewedRound}
                              aria-label={`View round ${round}`}
                              onClick={() =>
                                setRoundView(
                                  round === tournament.currentRound
                                    ? null
                                    : { tournamentId: tournament.id, round },
                                )
                              }
                            >
                              Round {round}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <PairingsTable
                      pairings={viewedPairings}
                      standings={snapshot.standings}
                      canEdit={Boolean(
                        snapshot.canEdit && viewedRound === tournament?.currentRound,
                      )}
                      working={working}
                      savingResultIds={savingResultIds}
                      onResult={saveResult}
                    />
                  </TabsContent>

                  <TabsContent value="standings" className="tab-panel">
                    <Table className="swiss-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead>Rating</TableHead>
                          <TableHead>Pts</TableHead>
                          <TableHead>BH</TableHead>
                          <TableHead>SB</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {snapshot.standings.map((standing) => (
                          <TableRow key={standing.playerId}>
                            <TableCell className="rank-cell">{standing.rank}</TableCell>
                            <TableCell className="player-name-cell">
                              {standing.name}
                            </TableCell>
                            <TableCell>{standing.rating || "—"}</TableCell>
                            <TableCell className="score-cell">
                              {score(standing.score)}
                            </TableCell>
                            <TableCell>{score(standing.buchholz)}</TableCell>
                            <TableCell>{score(standing.sonnebornBerger)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="players" className="tab-panel">
                    {snapshot.canEdit && tournament?.currentRound === 0 && (
                      <form className="player-form" onSubmit={addPlayer}>
                        <label>
                          <span>Player name</span>
                          <Input
                            required
                            value={playerForm.name}
                            onChange={(event) =>
                              setPlayerForm((form) => ({
                                ...form,
                                name: event.target.value,
                              }))
                            }
                            placeholder="e.g. Vera Menchik"
                          />
                        </label>
                        <label>
                          <span>FIDE ID</span>
                          <Input
                            value={playerForm.fideId}
                            onChange={(event) =>
                              setPlayerForm((form) => ({
                                ...form,
                                fideId: event.target.value,
                              }))
                            }
                            placeholder="Optional"
                          />
                        </label>
                        <label>
                          <span>Rating</span>
                          <Input
                            type="number"
                            min={0}
                            max={4000}
                            value={playerForm.rating}
                            onChange={(event) =>
                              setPlayerForm((form) => ({
                                ...form,
                                rating: Number(event.target.value),
                              }))
                            }
                          />
                        </label>
                        <Button type="submit" disabled={working}>
                          <Plus /> Register
                        </Button>
                      </form>
                    )}

                    <Table className="swiss-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Seed</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead>FIDE ID</TableHead>
                          <TableHead>Rating</TableHead>
                          <TableHead>Check-in</TableHead>
                          <TableHead>Pairing status</TableHead>
                          <TableHead aria-label="Actions" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {snapshot.players.map((player) => (
                          <TableRow key={player.id}>
                            <TableCell className="rank-cell">
                              {String(player.seed).padStart(2, "0")}
                            </TableCell>
                            <TableCell className="player-name-cell">
                              {snapshot.canEdit ? (
                                <button
                                  className="player-name-button"
                                  type="button"
                                  onClick={() => setManagePlayerId(player.id)}
                                >
                                  {player.name}
                                  {player.isYou && <span className="you-tag">YOU</span>}
                                </button>
                              ) : (
                                <>
                                  {player.name}
                                  {player.isYou && <span className="you-tag">YOU</span>}
                                </>
                              )}
                            </TableCell>
                            <TableCell>{player.fideId || "—"}</TableCell>
                            <TableCell>{player.rating || "—"}</TableCell>
                            <TableCell>
                              {snapshot.canManageCheckIn && !player.withdrawn ? (
                                <Button
                                  size="sm"
                                  variant={player.checkedIn ? "default" : "outline"}
                                  disabled={working}
                                  onClick={() =>
                                    mutate(
                                      {
                                        action: "set_player_checked_in",
                                        tournamentId: tournament?.id,
                                        playerId: player.id,
                                        checkedIn: !player.checkedIn,
                                      },
                                      player.checkedIn
                                        ? `${player.name} check-in removed`
                                        : `${player.name} checked in`,
                                    )
                                  }
                                >
                                  <ClipboardCheck />
                                  {player.checkedIn ? "Checked in" : "Check in"}
                                </Button>
                              ) : (
                                <span className={`checkin-state ${player.checkedIn ? "is-checked" : ""}`}>
                                  {player.checkedIn ? "Checked in" : "Not checked in"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`player-state ${
                                  player.withdrawn
                                    ? "is-withdrawn"
                                    : player.nextRoundStatus === "skip"
                                      ? "is-skipping"
                                      : player.nextRoundStatus === "bye"
                                        ? "is-bye"
                                        : "is-active"
                                }`}
                              >
                                {player.withdrawn
                                  ? "Withdrawn"
                                  : player.nextRoundStatus === "skip"
                                    ? `Skips round ${(tournament?.currentRound ?? 0) + 1}`
                                    : player.nextRoundStatus === "bye"
                                      ? `Round ${(tournament?.currentRound ?? 0) + 1} · 1-pt bye`
                                      : "Active"}
                              </span>
                            </TableCell>
                            <TableCell className="actions-cell">
                              {snapshot.canEdit && tournament && (
                                <div className="player-actions">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    aria-label={`Manage ${player.name}`}
                                    disabled={working}
                                    onClick={() => setManagePlayerId(player.id)}
                                  >
                                    <Settings2 /> Manage
                                  </Button>
                                  {tournament.currentRound === 0 && (
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label={`Remove ${player.name}`}
                                      disabled={working}
                                      onClick={() =>
                                        mutate(
                                          {
                                            action: "remove_player",
                                            tournamentId: tournament.id,
                                            playerId: player.id,
                                          },
                                          "Player removed",
                                        )
                                      }
                                    >
                                      <Trash2 />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </Tabs>
              </div>
            </section>

            <footer className="product-note">
              <span>PAIRING METHOD / DUTCH-STYLE SCOREGROUPS</span>
              <span>ACCOUNT-SYNCED D1 STORAGE</span>
              <span>NOT FIDE-CERTIFIED</span>
            </footer>
          </>
        )}

        <JoinTournamentDialog
          open={joinOpen}
          onOpenChange={setJoinOpen}
          targetName={joinTargetName}
          form={joinForm}
          setForm={setJoinForm}
          onSubmit={joinTournament}
          working={working}
        />
        <RedeemModeratorDialog
          open={moderatorRedeemOpen}
          onOpenChange={setModeratorRedeemOpen}
          token={moderatorTokenInput}
          setToken={setModeratorTokenInput}
          onSubmit={redeemModeratorToken}
          working={working}
        />
        <ModeratorTokenDialog
          open={moderatorInviteOpen}
          onOpenChange={(open) => {
            setModeratorInviteOpen(open);
            if (!open) setIssuedModeratorToken(null);
          }}
          token={issuedModeratorToken}
        />
        <PlayerManagementDialog
          player={managedPlayer}
          open={Boolean(managedPlayer)}
          onOpenChange={(open) => !open && setManagePlayerId(null)}
          nextRound={(tournament?.currentRound ?? 0) + 1}
          hasNextRound={Boolean(
            tournament && tournament.currentRound < tournament.rounds,
          )}
          working={working}
          onSetNextStatus={async (status) => {
            if (!tournament || !managedPlayer) return;
            const updated = await mutate(
              {
                action: "set_player_next_round_status",
                tournamentId: tournament.id,
                playerId: managedPlayer.id,
                status,
              },
              status === "skip"
                ? `${managedPlayer.name} will skip the next round`
                : status === "bye"
                  ? `${managedPlayer.name} receives a 1-point bye next round`
                  : `${managedPlayer.name} will be paired normally`,
            );
            if (updated) setManagePlayerId(null);
          }}
          onToggleWithdraw={async () => {
            if (!tournament || !managedPlayer) return;
            const updated = await mutate(
              {
                action: "set_player_withdrawn",
                tournamentId: tournament.id,
                playerId: managedPlayer.id,
                withdrawn: !managedPlayer.withdrawn,
              },
              managedPlayer.withdrawn
                ? `${managedPlayer.name} reactivated`
                : `${managedPlayer.name} withdrawn from future rounds`,
            );
            if (updated) setManagePlayerId(null);
          }}
        />
      </section>
    </main>
  );
}

function PlayerManagementDialog({
  player,
  open,
  onOpenChange,
  nextRound,
  hasNextRound,
  working,
  onSetNextStatus,
  onToggleWithdraw,
}: {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextRound: number;
  hasNextRound: boolean;
  working: boolean;
  onSetNextStatus: (status: "active" | "skip" | "bye") => void | Promise<void>;
  onToggleWithdraw: () => void | Promise<void>;
}) {
  if (!player) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="create-dialog player-management-dialog">
        <DialogHeader>
          <p className="section-code">PLAYER / CONTROL</p>
          <DialogTitle>Manage {player.name}</DialogTitle>
          <DialogDescription>
            Choose a one-round instruction or withdraw the player from every
            future pairing. One-round instructions expire automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="player-management-summary">
          <span>Seed #{player.seed}</span>
          <span>{player.rating ? `${player.rating} rating` : "Unrated"}</span>
          <span>{player.withdrawn ? "Withdrawn" : "Tournament active"}</span>
        </div>

        {hasNextRound && !player.withdrawn && (
          <div className="player-management-options">
            <p>NEXT ROUND · {String(nextRound).padStart(2, "0")}</p>
            <Button
              variant={player.nextRoundStatus === "active" ? "default" : "outline"}
              disabled={working}
              onClick={() => onSetNextStatus("active")}
            >
              <UserCheck /> Pair normally
            </Button>
            <Button
              variant={player.nextRoundStatus === "skip" ? "default" : "outline"}
              disabled={working}
              onClick={() => onSetNextStatus("skip")}
            >
              <UserMinus /> Skip round · 0 points
            </Button>
            <Button
              variant={player.nextRoundStatus === "bye" ? "default" : "outline"}
              disabled={working}
              onClick={() => onSetNextStatus("bye")}
            >
              <Trophy /> Award 1-point bye
            </Button>
          </div>
        )}

        <div className="withdrawal-panel">
          <div>
            <strong>{player.withdrawn ? "Return to tournament" : "Withdraw from tournament"}</strong>
            <p>
              {player.withdrawn
                ? "The player becomes eligible for future rounds again."
                : "The player remains in standings and history but is excluded from every future round."}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={working}
            onClick={onToggleWithdraw}
          >
            {player.withdrawn ? <UserCheck /> : <UserMinus />}
            {player.withdrawn ? "Reactivate" : "Withdraw"}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({
  code,
  label,
  value,
  accent = false,
}: {
  code: string;
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <article className={`metric ${accent ? "metric-accent" : ""}`}>
      <span>{code}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function PairingsTable({
  pairings,
  standings,
  canEdit,
  working,
  savingResultIds,
  onResult,
}: {
  pairings: Pairing[];
  standings: Standing[];
  canEdit: boolean;
  working: boolean;
  savingResultIds: ReadonlySet<string>;
  onResult: (pairing: Pairing, result: EnterableResult) => void;
}) {
  const scoreByPlayerId = new Map(
    standings.map((standing) => [standing.playerId, standing.score]),
  );

  if (pairings.length === 0) {
    return (
      <div className="empty-table">
        <Trophy />
        <h3>No round paired yet</h3>
        <p>Register at least two players, then generate the first round.</p>
      </div>
    );
  }

  return (
    <div>
      <Table className="swiss-table pairing-table">
      <TableHeader>
        <TableRow>
          <TableHead>Board</TableHead>
          <TableHead>White</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>Black</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pairings.map((pairing) => {
          const saving = savingResultIds.has(pairing.id);
          return (
          <TableRow key={pairing.id}>
            <TableCell className="board-cell">
              {String(pairing.boardNumber).padStart(2, "0")}
            </TableCell>
            <TableCell className="player-name-cell">
              <span className="pairing-player-line">
                <span className="color-chip color-white" aria-label="White" />
                <span>{pairing.whiteName}</span>
                <span className="pairing-points">
                  {score(scoreByPlayerId.get(pairing.whitePlayerId ?? "") ?? 0)} pts
                </span>
              </span>
            </TableCell>
            <TableCell>
              {pairing.result === "1-BYE" ? (
                <span className="bye-result">1–0 BYE</span>
              ) : canEdit ? (
                <div
                  className="result-choice-group"
                  role="group"
                  aria-label={`Result for board ${pairing.boardNumber}`}
                >
                  {([
                    ["1-0", "1–0"],
                    ["½-½", "½–½ Draw"],
                    ["0-1", "0–1"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={pairing.result === value ? "is-selected" : ""}
                      aria-pressed={pairing.result === value}
                      disabled={working || saving}
                      onClick={() => onResult(pairing, value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <strong>{resultLabel(pairing.result)}</strong>
              )}
            </TableCell>
            <TableCell className="player-name-cell">
              {pairing.blackPlayerId ? (
                <span className="pairing-player-line">
                  <span className="color-chip color-black" aria-label="Black" />
                  <span>{pairing.blackName}</span>
                  <span className="pairing-points">
                    {score(scoreByPlayerId.get(pairing.blackPlayerId) ?? 0)} pts
                  </span>
                </span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>
              <span
                className={`status-dot ${saving ? "saving" : ""} ${pairing.result !== "*" ? "done" : ""} ${
                  isNoShowResult(pairing.result) ? "forfeit" : ""
                }`}
              >
                {!saving && pairing.result !== "*" ? <Check /> : null}
                {saving
                  ? "Saving…"
                  : isNoShowResult(pairing.result)
                  ? "No-show"
                  : pairing.result !== "*"
                    ? "Recorded"
                    : "Open"}
              </span>
            </TableCell>
          </TableRow>
          );
        })}
      </TableBody>
      </Table>
      {canEdit && (
        <p className="pairing-guidance">
          Record each board as 1–0, 0–1 or a draw. The next-round button appears
          only after every board in this round has a result.
        </p>
      )}
    </div>
  );
}

function TournamentLibrary({
  payload,
  createOpen,
  setCreateOpen,
  signInPath,
  tournamentForm,
  setTournamentForm,
  createTournament,
  working,
  onOpenTournament,
  onJoinTournament,
  onRedeemModerator,
  onDeleteModerator,
  onDeleteAccount,
  onRevokeModeratorToken,
  onDeleteModeratorToken,
  onCreateTestTournament,
  onRefresh,
  onDeleteTournament,
}: {
  payload: ManagerPayload;
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  signInPath: string;
  tournamentForm: { name: string; city: string; rounds: number };
  setTournamentForm: (
    value: { name: string; city: string; rounds: number },
  ) => void;
  createTournament: (event: FormEvent) => void;
  working: boolean;
  onOpenTournament: (tournamentId: string) => void | Promise<void>;
  onJoinTournament: (tournament?: TournamentSummary) => void;
  onRedeemModerator: () => void;
  onDeleteModerator: (email: string) => void | Promise<boolean>;
  onDeleteAccount: (email: string) => void | Promise<boolean>;
  onRevokeModeratorToken: (tokenId: string) => void | Promise<boolean>;
  onDeleteModeratorToken: (tokenId: string) => void | Promise<boolean>;
  onCreateTestTournament: () => void | Promise<boolean>;
  onRefresh: () => void | Promise<void>;
  onDeleteTournament: (tournament: TournamentSummary) => void | Promise<boolean>;
}) {
  return (
    <div className="library-shell">
      <section className="library-heading">
        <div>
          <p className="section-code">FREE / OPEN / ACCOUNT-SYNCED</p>
          <h1>Your tournament<br />library.</h1>
        </div>
        <div className="library-intro">
        <p>
            Moderators operate assigned tournaments. Players can only register,
            view pairings and follow standings from their signed-in account.
        </p>
          <div className="library-actions">
            {payload.authenticated ? (
              <>
                {payload.canCreateTournament && (
                  <CreateTournamentDialog
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    form={tournamentForm}
                    setForm={setTournamentForm}
                    onSubmit={createTournament}
                    working={working}
                    prominent
                  />
                )}
                <Button variant="outline" onClick={() => onJoinTournament()}>
                  <KeyRound /> Join with code
                </Button>
                {payload.viewerGlobalRole !== "superadmin" && (
                  <Button variant="outline" onClick={onRedeemModerator}>
                    <ShieldCheck /> Use moderator token
                  </Button>
                )}
              </>
            ) : (
              <a className="large-signin" href={signInPath} target="_top">
                Sign in <ArrowRight />
              </a>
            )}
          </div>
        </div>
      </section>

      {payload.authenticated && (
        <section className="library-section">
          <div className="library-section-title">
            <p className="section-code">01 / YOUR TOURNAMENTS</p>
            <span>{payload.tournaments.length} SAVED</span>
          </div>
          {payload.tournaments.length ? (
            <div className="tournament-card-grid">
              {payload.tournaments.map((item) => (
                <TournamentCard
                  key={item.id}
                  item={item}
                  onOpen={onOpenTournament}
                  onDelete={onDeleteTournament}
                />
              ))}
            </div>
          ) : (
            <div className="empty-library-note">
              <strong>No saved tournaments yet.</strong>
              <span>Create one as admin or join one with a code.</span>
            </div>
          )}
        </section>
      )}

      {payload.viewerGlobalRole === "superadmin" && (
        <SuperadminDirectory
          payload={payload}
          working={working}
          onDeleteModerator={onDeleteModerator}
          onDeleteAccount={onDeleteAccount}
          onRevokeToken={onRevokeModeratorToken}
          onDeleteToken={onDeleteModeratorToken}
          onCreateTestTournament={onCreateTestTournament}
          onRefresh={onRefresh}
        />
      )}

      <section className="library-section open-section">
        <div className="library-section-title">
          <p className="section-code">
            {payload.authenticated ? "02" : "01"} / OPEN REGISTRATION
          </p>
          <span>{payload.openTournaments.length} OPEN</span>
        </div>
        {payload.openTournaments.length ? (
          <div className="tournament-card-grid">
            {payload.openTournaments.map((item) => (
              <TournamentCard
                key={item.id}
                item={item}
                onOpen={onOpenTournament}
                onJoin={payload.authenticated ? onJoinTournament : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="empty-library-note">
            <strong>No public registrations are open.</strong>
            <span>You can still join a private listing with its six-character code.</span>
          </div>
        )}
      </section>

      <div className="library-features">
        <span><Users /> Player registry</span>
        <span><RefreshCw /> Deterministic pairing</span>
        <span><Trophy /> Live standings</span>
      </div>
    </div>
  );
}

function TournamentCard({
  item,
  onOpen,
  onJoin,
  onDelete,
}: {
  item: TournamentSummary;
  onOpen: (tournamentId: string) => void | Promise<void>;
  onJoin?: (tournament: TournamentSummary) => void;
  onDelete?: (tournament: TournamentSummary) => void | Promise<boolean>;
}) {
  const roleLabel =
    item.role === "superadmin"
      ? "SUPERADMIN"
      : item.role === "moderator"
        ? "MODERATOR"
        : item.role === "player"
          ? "PLAYER"
          : "OPEN";

  return (
    <article className="tournament-card">
      <div className="tournament-card-topline">
        <span className={`role-badge role-${item.role}`}>{roleLabel}</span>
        <span>{statusLabel(item.status)}</span>
      </div>
      <h2>{item.name}</h2>
      <p>{item.city || "Location not set"}</p>
      <div className="card-meta">
        <span>{item.playerCount} players</span>
        <span>Round {item.currentRound}/{item.rounds}</span>
        {(item.role === "superadmin" || item.role === "moderator") && item.joinCode && (
          <span>Code {item.joinCode}</span>
        )}
      </div>
      <div className="card-actions">
        <Button variant="outline" onClick={() => void onOpen(item.id)}>
          {item.role === "visitor" ? "View" : "Open desk"} <ArrowRight />
        </Button>
        {onJoin && (
          <Button onClick={() => onJoin(item)}>
            <UserPlus /> Join
          </Button>
        )}
        {item.role === "superadmin" && onDelete && (
          <DeleteTournamentDialog
            tournament={item}
            onDelete={() => onDelete(item)}
          />
        )}
      </div>
    </article>
  );
}

function SuperadminDirectory({
  payload,
  working,
  onDeleteModerator,
  onDeleteAccount,
  onRevokeToken,
  onDeleteToken,
  onCreateTestTournament,
  onRefresh,
}: {
  payload: ManagerPayload;
  working: boolean;
  onDeleteModerator: (email: string) => void | Promise<boolean>;
  onDeleteAccount: (email: string) => void | Promise<boolean>;
  onRevokeToken: (tokenId: string) => void | Promise<boolean>;
  onDeleteToken: (tokenId: string) => void | Promise<boolean>;
  onCreateTestTournament: () => void | Promise<boolean>;
  onRefresh: () => void | Promise<void>;
}) {
  const now = new Date(payload.serverTime).getTime();

  function tokenStatus(token: ManagerPayload["moderatorTokens"][number]) {
    if (token.usedAt) return "used" as const;
    if (token.revokedAt) return "revoked" as const;
    if (new Date(token.expiresAt).getTime() <= now) return "expired" as const;
    return "unused" as const;
  }

  function compactDate(value: string) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  return (
    <section className="library-section admin-directory">
      <div className="library-section-title">
        <div>
          <p className="section-code">SUPERADMIN / ACCESS CONTROL</p>
          <h2><Crown /> Superadmin control desk</h2>
        </div>
        <div className="admin-directory-actions">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={working}>
                <FlaskConical /> Create Top 64 test
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="confirmation-dialog">
              <AlertDialogHeader>
                <p className="section-code">SUPERADMIN / TEST DATA</p>
                <AlertDialogTitle>Create the 2700chess Top 64 test?</AlertDialogTitle>
                <AlertDialogDescription>
                  This creates the September 2026 top 64 with their classical ratings,
                  checks everyone in, and generates only Round 1 with no results.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={working}
                  onClick={() => void onCreateTestTournament()}
                >
                  <FlaskConical /> Create Top 64 and Round 1
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <p className="admin-directory-note">
        Moderator tokens work once and expire after seven days. Full codes are
        never stored; this ledger keeps a safe masked reference, its scope, and
        exactly who redeemed it.
      </p>
      <div className="token-ledger">
        <div className="token-ledger-heading">
          <div>
            <h3>Moderator token ledger</h3>
            <p>{payload.moderatorTokens.length} token(s) recorded</p>
          </div>
          <Button variant="outline" size="sm" disabled={working} onClick={() => void onRefresh()}>
            <RefreshCw /> Refresh
          </Button>
        </div>
        {payload.moderatorTokens.length ? (
          <div className="token-ledger-list">
            {payload.moderatorTokens.map((token) => {
              const status = tokenStatus(token);
              return (
                <article className="token-ledger-row" key={token.id}>
                  <div className="token-ledger-identity">
                    <code>{token.tokenHint ?? "Legacy token"}</code>
                    <span className={`token-status token-status-${status}`}>{status}</span>
                  </div>
                  <div className="token-ledger-detail">
                    <strong>{token.tournamentName ?? "Global moderator"}</strong>
                    <small>Created by {token.createdByName ?? token.createdByEmail}</small>
                    <small>{compactDate(token.createdAt)} · expires {compactDate(token.expiresAt)}</small>
                  </div>
                  <div className="token-ledger-user">
                    {token.usedAt ? (
                      <>
                        <strong>{token.usedByName ?? token.usedByEmail}</strong>
                        <small>{token.usedByEmail}</small>
                        <small>Used {compactDate(token.usedAt)}</small>
                      </>
                    ) : token.revokedAt ? (
                      <>
                        <strong>Revoked</strong>
                        <small>By {token.revokedByEmail ?? "superadmin"}</small>
                        <small>{compactDate(token.revokedAt)}</small>
                      </>
                    ) : (
                      <>
                        <strong>No one has used it</strong>
                        <small>{status === "expired" ? "Expired without use" : "Waiting for redemption"}</small>
                      </>
                    )}
                  </div>
                  <div className="token-ledger-actions">
                    {status === "unused" && (
                      <DangerConfirmDialog
                        triggerLabel="Revoke"
                        title={`Revoke ${token.tokenHint ?? "this token"}?`}
                        description="It will stop working immediately and cannot be restored."
                        working={working}
                        onConfirm={() => onRevokeToken(token.id)}
                      />
                    )}
                    <DangerConfirmDialog
                      triggerLabel="Delete"
                      title={`Permanently delete ${token.tokenHint ?? "this token record"}?`}
                      description="This permanently removes the token and its usage history from the ledger. This cannot be undone."
                      working={working}
                      onConfirm={() => onDeleteToken(token.id)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="directory-empty">No moderator tokens yet.</p>
        )}
      </div>
      <div className="admin-directory-grid">
        <div className="admin-directory-table">
          <h3>Moderators</h3>
          {payload.moderators.length ? (
            payload.moderators.map((moderator) => (
              <div className="directory-row" key={moderator.email}>
                <span>
                  <strong>{moderator.displayName}</strong>
                  <small>{moderator.email} · {moderator.tournamentCount} tournament(s)</small>
                </span>
                <DangerConfirmDialog
                  triggerLabel="Delete moderator"
                  title={`Delete moderator ${moderator.displayName}?`}
                  description="This revokes every tournament assignment and moderator token. Their player account remains available."
                  working={working}
                  onConfirm={() => onDeleteModerator(moderator.email)}
                />
              </div>
            ))
          ) : (
            <p className="directory-empty">No moderators yet.</p>
          )}
        </div>
        <div className="admin-directory-table">
          <h3>Accounts</h3>
          {payload.accounts.map((account) => (
            <div className="directory-row" key={account.email}>
              <span>
                <strong>{account.displayName}</strong>
                <small>
                  {account.email}{account.isModerator ? " · Moderator" : " · Player"}
                </small>
              </span>
              {account.email !== payload.viewerEmail && (
                <DangerConfirmDialog
                  triggerLabel="Delete account"
                  title={`Delete ${account.displayName}'s account?`}
                  description="This removes their app account and moderator access. Existing tournament results remain, but their player entries are detached from the deleted account."
                  working={working}
                  onConfirm={() => onDeleteAccount(account.email)}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DangerConfirmDialog({
  triggerLabel,
  title,
  description,
  working,
  onConfirm,
  icon = "trash",
}: {
  triggerLabel: string;
  title: string;
  description: string;
  working: boolean;
  onConfirm: () => void | Promise<unknown>;
  icon?: "trash" | "undo";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={working}>
          {icon === "undo" ? <Undo2 /> : <Trash2 />} {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="confirmation-dialog">
        <AlertDialogHeader>
          <p className="section-code">
            {icon === "undo" ? "ROUND / CONTROL" : "CONFIRM / PERMANENT ACTION"}
          </p>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={working}
            onClick={() => void onConfirm()}
          >
            {icon === "undo" ? <Undo2 /> : <Trash2 />} Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteTournamentDialog({
  tournament,
  onDelete,
  working = false,
}: {
  tournament: Tournament | TournamentSummary;
  onDelete: () => void | Promise<boolean>;
  working?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="delete-tournament-button" disabled={working}>
          <Trash2 /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="confirmation-dialog">
        <AlertDialogHeader>
          <p className="section-code">TOURNAMENT / DELETE</p>
          <AlertDialogTitle>Delete “{tournament.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes its players, rounds, pairings, results, join
            code and standings. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep tournament</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={working}
            onClick={() => void onDelete()}
          >
            <Trash2 /> Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateTournamentDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  working,
  prominent = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: { name: string; city: string; rounds: number };
  setForm: (form: { name: string; city: string; rounds: number }) => void;
  onSubmit: (event: FormEvent) => void;
  working: boolean;
  prominent?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className={prominent ? "large-create" : ""}>
          <Plus /> New tournament
        </Button>
      </DialogTrigger>
      <DialogContent className="create-dialog">
        <DialogHeader>
          <p className="section-code">NEW / TOURNAMENT</p>
          <DialogTitle>Set the field.</DialogTitle>
          <DialogDescription>
            Create the tournament shell. Player registration comes next.
          </DialogDescription>
        </DialogHeader>
        <form className="dialog-form" onSubmit={onSubmit}>
          <label>
            <span>Tournament name</span>
            <Input
              required
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Open Zürich 2026"
            />
          </label>
          <label>
            <span>City / venue</span>
            <Input
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
              placeholder="Zürich"
            />
          </label>
          <label>
            <span>Scheduled rounds</span>
            <Input
              type="number"
              min={3}
              max={15}
              value={form.rounds}
              onChange={(event) => setForm({ ...form, rounds: Number(event.target.value) })}
            />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={working}>
              Create control desk <ArrowRight />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JoinTournamentDialog({
  open,
  onOpenChange,
  targetName,
  form,
  setForm,
  onSubmit,
  working,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetName: string | null;
  form: {
    tournamentId: string;
    joinCode: string;
    name: string;
    fideId: string;
    rating: number;
  };
  setForm: (form: {
    tournamentId: string;
    joinCode: string;
    name: string;
    fideId: string;
    rating: number;
  }) => void;
  onSubmit: (event: FormEvent) => void;
  working: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="create-dialog">
        <DialogHeader>
          <p className="section-code">PLAYER / REGISTRATION</p>
          <DialogTitle>Join the field.</DialogTitle>
          <DialogDescription>
            {targetName
              ? `Register as a player in ${targetName}.`
              : "Enter the six-character code shared by the tournament admin."}
          </DialogDescription>
        </DialogHeader>
        <form className="dialog-form" onSubmit={onSubmit}>
          {!form.tournamentId && (
            <label>
              <span>Join code</span>
              <Input
                required
                autoFocus
                maxLength={12}
                className="code-input"
                value={form.joinCode}
                onChange={(event) =>
                  setForm({ ...form, joinCode: event.target.value.toUpperCase() })
                }
                placeholder="ABC123"
              />
            </label>
          )}
          <label>
            <span>Your player name</span>
            <Input
              required
              autoFocus={Boolean(form.tournamentId)}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Name shown in pairings"
            />
          </label>
          <label>
            <span>FIDE ID</span>
            <Input
              value={form.fideId}
              onChange={(event) => setForm({ ...form, fideId: event.target.value })}
              placeholder="Optional"
            />
          </label>
          <label>
            <span>Rating</span>
            <Input
              type="number"
              min={0}
              max={4000}
              value={form.rating}
              onChange={(event) =>
                setForm({ ...form, rating: Number(event.target.value) })
              }
            />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={working}>
              <UserPlus /> Join tournament
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RedeemModeratorDialog({
  open,
  onOpenChange,
  token,
  setToken,
  onSubmit,
  working,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  setToken: (token: string) => void;
  onSubmit: (event: FormEvent) => void;
  working: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="create-dialog">
        <DialogHeader>
          <p className="section-code">ONE-TIME / MODERATOR TOKEN</p>
          <DialogTitle>Activate moderator access.</DialogTitle>
          <DialogDescription>
            Each token can be used by exactly one signed-in account. A
            tournament token grants control only for that tournament.
          </DialogDescription>
        </DialogHeader>
        <form className="dialog-form" onSubmit={onSubmit}>
          <label>
            <span>Moderator token</span>
            <Input
              required
              autoFocus
              className="code-input"
              value={token}
              onChange={(event) => setToken(event.target.value.toUpperCase())}
              placeholder="MOD-XXXX-XXXX-XXXX"
            />
          </label>
          <DialogFooter>
            <Button type="submit" disabled={working}>
              <ShieldCheck /> Activate access
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModeratorTokenDialog({
  open,
  onOpenChange,
  token,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
}) {
  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    toast.success("Moderator token copied");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="create-dialog">
        <DialogHeader>
          <p className="section-code">MODERATOR / INVITATION</p>
          <DialogTitle>Single-use token created.</DialogTitle>
          <DialogDescription>
            Send this token privately. It is shown here only for this invitation,
            works once, and expires after seven days.
          </DialogDescription>
        </DialogHeader>
        <div className="issued-token">
          <code>{token ?? "—"}</code>
          <Button onClick={() => void copyToken()} disabled={!token}>
            <Copy /> Copy token
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
