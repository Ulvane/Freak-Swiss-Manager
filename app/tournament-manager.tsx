"use client";

import { FormEvent, Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Crown,
  Download,
  FlaskConical,
  KeyRound,
  Plus,
  Pencil,
  Printer,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Trophy,
  Undo2,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { useLanguage } from "./language-provider";
import { LanguageToggle } from "@/components/language-toggle";
import { StandingMarker, standingAward } from "@/components/standing-marker";
import { PixelArrow } from "@/components/pixel-arrow";
import { PlayerHistoryPanel } from "@/components/player-history-panel";
import { getPlayerHistory } from "@/lib/player-history";
import { SmoothAccordion, ACCORDION_DURATION } from "@/components/smooth-accordion";
import { ThemeToggles } from "@/components/theme-toggles";
import { WheelPicker } from "@/components/wheel-picker";
import { toast } from "sonner";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { QrCode as QrCodeImage } from "@/components/qr-code";
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
import { getGuestRegistration, removeGuestRegistration } from "@/lib/guest-storage";
import {
  applyPairingResult,
  countPendingResults,
  pairingsForRound,
  type EnterableResult,
} from "@/lib/result-workflow";
import { createCrosstableRows } from "@/lib/crosstable";
import type {
  ManagerPayload,
  Pairing,
  Player,
  ResultCode,
  Standing,
  Tournament,
  TournamentSummary,
  TournamentVisibility,
} from "@/lib/tournament-types";

type Props = {
  signInPath: string;
  signOutPath: string;
};

function reloadForBan(data: { banned?: boolean }) {
  if (!data.banned) return false;
  window.location.reload();
  return true;
}

const emptyPayload: ManagerPayload = {
  serverTime: "1970-01-01T00:00:00.000Z",
  authenticated: false,
  viewerName: null,
  viewerEmail: null,
  viewerGlobalRole: "visitor",
  canCreateTournament: false,
  canCreateOfficialTournaments: false,
  tournaments: [],
  communityTournaments: [],
  openTournaments: [],
  archivedOfficialTournaments: [],
  archivedCommunityTournaments: [],
  snapshot: null,
  accounts: [],
  moderators: [],
  moderatorTokens: [],
  guests: [],
  moderationAuditLog: [],
  publicStaff: [],
  canRedeemModeratorToken: false,
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
  const { language } = useLanguage();
  const isTr = language === "tr";
  const [payload, setPayload] = useState<ManagerPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const latestLoadId = useRef(0);
  const [working, setWorking] = useState(false);
  const [savingResultIds, setSavingResultIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showLibrary, setShowLibrary] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [protestOpen, setProtestOpen] = useState(false);
  const [moderatorRedeemOpen, setModeratorRedeemOpen] = useState(false);
  const [moderatorTokenInput, setModeratorTokenInput] = useState("");
  const [moderatorInviteOpen, setModeratorInviteOpen] = useState(false);
  const [issuedModeratorToken, setIssuedModeratorToken] = useState<string | null>(null);
  const [issuedModeratorTargetEmail, setIssuedModeratorTargetEmail] = useState<string | null>(null);
  const [joinTargetName, setJoinTargetName] = useState<string | null>(null);
  const [managePlayerId, setManagePlayerId] = useState<string | null>(null);
  const [historySelection, setHistorySelection] = useState<{
    playerId: string;
    tournamentId: string;
    open: boolean;
  } | null>(null);
  const [roundView, setRoundView] = useState<{
    tournamentId: string;
    round: number;
  } | null>(null);
  const [tournamentForm, setTournamentForm] = useState({
    name: "",
    city: "",
    rounds: 5,
    visibility: "community" as TournamentVisibility,
    playerLimit: 32,
  });
  const [playerForm, setPlayerForm] = useState({
    name: "",
    rating: 1500,
  });
  const [joinForm, setJoinForm] = useState({
    tournamentId: "",
    joinCode: "",
    name: "",
    rating: 1500,
  });

  const load = useCallback(async (tournamentId?: string | null) => {
    const loadId = latestLoadId.current + 1;
    latestLoadId.current = loadId;
    try {
      const query = tournamentId ? `?t=${encodeURIComponent(tournamentId)}` : "";
      const response = await fetch(`/api/manager${query}`, { cache: "no-store" });
      const data = (await response.json()) as ManagerPayload & {
        banned?: boolean;
        error?: string;
      };
      if (reloadForBan(data)) return;
      if (!response.ok) throw new Error(data.error || "Unable to load tournament");
      if (latestLoadId.current === loadId) setPayload(data);
    } catch (error) {
      if (latestLoadId.current === loadId) {
        toast.error(error instanceof Error ? error.message : "Unable to load tournament");
      }
    } finally {
      if (latestLoadId.current === loadId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const tournamentId = new URLSearchParams(window.location.search).get("t");
      setShowLibrary(!tournamentId);
      void load(tournamentId);
    };
    const timer = window.setTimeout(() => {
      syncFromUrl();
    }, 0);
    window.addEventListener("popstate", syncFromUrl);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", syncFromUrl);
    };
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
          banned?: boolean;
          tournamentId?: string;
          deletedTournamentId?: string;
        };
        if (reloadForBan(data)) return false;
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
  const guestEntry = useMemo(
    () => (tournament ? getGuestRegistration(tournament.id) : null),
    [tournament],
  );

  const managedPlayer =
    snapshot?.players.find((player) => player.id === managePlayerId) ?? null;
  const currentPlayer = snapshot?.players.find((player) => player.isYou) ?? null;
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
  const crosstableRows = useMemo(
    () =>
      snapshot
        ? createCrosstableRows(
            snapshot.players,
            snapshot.pairings,
            snapshot.standings,
            snapshot.roundStatuses,
            snapshot.tournament.currentRound,
          )
        : [],
    [snapshot],
  );
  const historyPlayerId = historySelection?.tournamentId === snapshot?.tournament.id
    ? historySelection?.playerId
    : undefined;
  const playerHistory = useMemo(
    () => snapshot && historyPlayerId
      ? getPlayerHistory(
          historyPlayerId,
          snapshot.players,
          snapshot.pairings,
          snapshot.standings,
          snapshot.roundStatuses,
          snapshot.tournament.currentRound,
        )
      : null,
    [snapshot, historyPlayerId],
  );

  // Keep the selected row during its exit animation. Cancel stale work on every toggle.
  useEffect(() => {
    if (!historySelection || !historyPlayerId) return;
    const timeout = setTimeout(() => {
      if (!historySelection.open) {
        setHistorySelection(null);
        return;
      }
      const anchors = [
        document.getElementById(`player-history-anchor-${historyPlayerId}`),
        document.getElementById(`player-history-anchor-mobile-${historyPlayerId}`),
      ];
      const anchor = anchors.find((element) => element && element.getClientRects().length > 0);
      anchor?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }, historySelection.open ? 120 : ACCORDION_DURATION);
    return () => clearTimeout(timeout);
  }, [historySelection, historyPlayerId]);

  const handleTogglePlayerHistory = (playerId: string) => {
    if (!snapshot) return;
    const tournamentId = snapshot.tournament.id;
    setHistorySelection((previous) => ({
      playerId,
      tournamentId,
      open: !(previous?.playerId === playerId && previous.tournamentId === tournamentId && previous.open),
    }));
  };
  const remainingResults = countPendingResults(currentPairings);
  const hasStandingResults = snapshot?.pairings.some((pairing) => pairing.result !== "*") ?? false;
  const hasChampion = snapshot && standingAward({
    rank: 1,
    tournament: snapshot.tournament,
    hasResults: hasStandingResults,
    saving: savingResultIds.size > 0,
  }) === "gold";
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
      const data = (await response.json()) as { banned?: boolean; error?: string };
      if (reloadForBan(data)) return;
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
      setTournamentForm({
        name: "",
        city: "",
        rounds: 5,
        visibility: payload.canCreateOfficialTournaments ? "official" : "community",
        playerLimit: 32,
      });
    }
  }

  function changeCreateOpen(open: boolean) {
    if (open) {
      setTournamentForm((current) => {
        const rounds = current.rounds || 5;
        return {
          ...current,
          rounds,
          playerLimit: Math.min(500, Math.pow(2, rounds)),
          visibility: payload.canCreateOfficialTournaments ? "official" : "community",
        };
      });
    }
    setCreateOpen(open);
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
      "Guest player added",
    );
    if (added) setPlayerForm({ name: "", rating: 1500 });
  }

  async function chooseTournament(tournamentId: string) {
    window.history.pushState({}, "", `?t=${encodeURIComponent(tournamentId)}`);
    setShowLibrary(false);
    await load(tournamentId);
  }

  async function openLibrary() {
    if (window.location.search) {
      window.history.pushState({}, "", window.location.pathname);
    }
    await load();
    setShowLibrary(true);
  }

  async function openCommunityLibrary() {
    await openLibrarySection("community-tournaments");
  }

  async function openArchiveLibrary() {
    await openLibrarySection("tournament-archive");
  }

  async function openLibrarySection(sectionId: string) {
    await openLibrary();
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function openJoinDialog(tournamentItem?: TournamentSummary) {
    setJoinTargetName(tournamentItem?.name ?? null);
    setJoinForm({
      tournamentId: tournamentItem?.id ?? "",
      joinCode: "",
      name: payload.viewerName ?? "",
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

  async function withdrawSelf() {
    if (!tournament) return;
    setWorking(true);
    try {
      const response = await fetch("/api/manager", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "self_withdraw", tournamentId: tournament.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        banned?: boolean;
        error?: string;
      };
      if (reloadForBan(data)) return;
      if (!response.ok) throw new Error(data.error || "Unable to withdraw");
      toast.success("You withdrew from this tournament");
      await load(tournament.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to withdraw");
    } finally {
      setWorking(false);
    }
  }

  async function withdrawGuestSelf() {
    if (!tournament || !guestEntry) return;
    setWorking(true);
    try {
      const response = await fetch("/api/player/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tournamentId: tournament.id,
          guestToken: guestEntry.token,
          confirm: true,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        banned?: boolean;
        error?: string;
      };
      if (reloadForBan(data)) return;
      if (!response.ok) throw new Error(data.error || "Unable to withdraw");
      toast.success("You withdrew from this tournament");
      removeGuestRegistration(tournament.id);
      await load(tournament.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to withdraw");
    } finally {
      setWorking(false);
    }
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

  async function issueModeratorToken(targetEmail: string) {
    setWorking(true);
    try {
      const response = await fetch("/api/manager", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_moderator_token", targetEmail }),
      });
      const data = (await response.json()) as {
        banned?: boolean;
        error?: string;
        moderatorToken?: string;
      };
      if (reloadForBan(data)) return false;
      if (!response.ok || !data.moderatorToken) {
        throw new Error(data.error || "Unable to create moderator token");
      }
      setIssuedModeratorToken(data.moderatorToken);
      setIssuedModeratorTargetEmail(targetEmail);
      setModeratorInviteOpen(true);
      await load();
      toast.success("Single-use moderator token created");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create token");
      return false;
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

  async function exportTournamentBackup() {
    if (!tournament) return;
    setWorking(true);
    try {
      const response = await fetch("/api/manager", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "export_tournament",
          tournamentId: tournament.id,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        banned?: boolean;
        error?: string;
        backup?: unknown;
      };
      if (reloadForBan(data)) return;
      if (!response.ok || !data.backup) {
        throw new Error(data.error || "Unable to export tournament");
      }
      const blob = new Blob([JSON.stringify(data.backup, null, 2)], {
        type: "application/json",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = tournament.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "tournament";
      link.href = objectUrl;
      link.download = `${safeName}-backup.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("Tournament backup downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export tournament");
    } finally {
      setWorking(false);
    }
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
          <Link
            className="wordmark wordmark-button"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              void openLibrary();
            }}
          >
            Freak<span>Swiss</span> Manager
          </Link>
          <div className="topbar-meta">
            <span className="beta-tag">OPEN BETA</span>
            <button
              className="protest-button"
              type="button"
              onClick={() => setProtestOpen(true)}
            >
              PROTEST
            </button>
            <a className="text-link audit-link" href="/benchmark">
              <FlaskConical /> Pairing audit
            </a>
            <button
              className="text-link topbar-button"
              type="button"
              onClick={() => void openCommunityLibrary()}
            >
              Community tournaments
            </button>
            <button
              className="archive-menu-button"
              type="button"
              onClick={() => void openArchiveLibrary()}
              aria-label="Tournament archive"
              title="Tournament archive"
            >
              <Archive aria-hidden="true" />
              <span>Archive</span>
            </button>
            {payload.authenticated ? (
              <>
                <span className={`role-badge role-${payload.viewerGlobalRole}`}>
                  {payload.viewerGlobalRole === "superadmin"
                    ? "SUPERADMIN"
                    : payload.viewerGlobalRole.toUpperCase()}
                </span>
                <span className="viewer-name">{payload.viewerName}</span>
                <form action={signOutPath} method="post">
                  <button className="text-link topbar-button" type="submit">Sign out</button>
                </form>
              </>
            ) : (
              <a className="signin-link" href={signInPath} target="_top">
                Sign in <ArrowRight />
              </a>
            )}
            <LanguageToggle />
          </div>
        </header>

        <ProtestDialog open={protestOpen} onOpenChange={setProtestOpen} />
        <TournamentQrDialog
          open={qrOpen}
          onOpenChange={setQrOpen}
          joinCode={tournament?.joinCode ?? ""}
        />

        {showLibrary || !snapshot ? (
          <TournamentLibrary
            payload={payload}
            createOpen={createOpen}
            setCreateOpen={changeCreateOpen}
            signInPath={signInPath}
            tournamentForm={tournamentForm}
            setTournamentForm={setTournamentForm}
            createTournament={createTournament}
            working={working}
            onOpenTournament={chooseTournament}
            onJoinTournament={openJoinDialog}
            onRedeemModerator={() => setModeratorRedeemOpen(true)}
            onCreateModeratorToken={(targetEmail) => issueModeratorToken(targetEmail)}
            onDeleteModerator={(email) =>
              mutate({ action: "revoke_moderator", email }, "Moderator access revoked")
            }
            onDeleteAccount={(email) =>
              mutate({ action: "delete_account", email }, "Account deleted")
            }
            onBanAccount={(email, banned) =>
              mutate(
                { action: "set_account_banned", email, banned },
                banned ? "Account banned" : "Account unbanned",
              )
            }
            onRevokeSessions={(email) =>
              mutate({ action: "revoke_account_sessions", email }, "Account sessions revoked")
            }
            onKickGuest={(guest) =>
              mutate(
                { action: "kick_guest", tournamentId: guest.tournamentId, playerId: guest.playerId },
                `${guest.name} kicked from tournament`,
              )
            }
            onRevokeGuestAccess={(guest) =>
              mutate(
                { action: "revoke_guest_access", tournamentId: guest.tournamentId, playerId: guest.playerId },
                `${guest.name}'s guest access revoked`,
              )
            }
            onDeleteGuest={(guest) =>
              mutate(
                { action: "delete_guest", tournamentId: guest.tournamentId, playerId: guest.playerId },
                `${guest.name} deleted`,
              )
            }
            onBulkDeleteGuests={(guests) =>
              mutate(
                { action: "bulk_delete_guests", playerIds: guests.map((guest) => guest.playerId) },
                `${guests.length} guest entr${guests.length === 1 ? "y" : "ies"} removed`,
              )
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
                    : snapshot.viewerRole === "organizer"
                      ? "OWNER"
                    : snapshot.viewerRole === "player"
                      ? "PLAYER"
                      : "VIEWER"}
                </span>
                <h1>{tournament?.name}</h1>
                <p className="tournament-location">
                  {tournament?.city || "Location not set"}
                  <span aria-hidden="true">↗</span>
                  {tournament?.archivedAt
                    ? "Archived"
                    : tournament?.visibility === "official"
                      ? "Official listing"
                      : tournament?.visibility === "community"
                        ? "Community listing"
                        : "Private / code-only"}
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
                {snapshot.canEdit && tournament && (
                  <Button
                    variant="outline"
                    disabled={working}
                    onClick={() => void exportTournamentBackup()}
                  >
                    <Download /> Backup
                  </Button>
                )}
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
                {snapshot.canEdit && tournament && (
                  <TournamentSettingsDialog
                    tournament={tournament}
                    canChangeVisibility={snapshot.canChangeVisibility}
                    canUseOfficial={payload.canCreateOfficialTournaments}
                    working={working}
                    onSave={(form) =>
                      mutate(
                        { action: "update_tournament", tournamentId: tournament.id, ...form },
                        "Tournament settings updated",
                      )
                    }
                  />
                )}
                {snapshot.canArchiveTournament && tournament && (
                  <DangerConfirmDialog
                    triggerLabel={tournament.archivedAt ? "Restore" : "Archive"}
                    title={
                      tournament.archivedAt
                        ? `Restore ${tournament.name}?`
                        : `Archive ${tournament.name}?`
                    }
                    description={
                      tournament.archivedAt
                        ? "The tournament will return to its previous control state. Registration remains closed until you reopen it."
                        : "The tournament will leave public listings and registration will close. Players, rounds, pairings, and results are preserved."
                    }
                    working={working}
                    icon="archive"
                    onConfirm={() =>
                      mutate(
                        {
                          action: "set_tournament_archived",
                          tournamentId: tournament.id,
                          archived: !tournament.archivedAt,
                        },
                        tournament.archivedAt ? "Tournament restored" : "Tournament archived",
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
                {payload.canCreateTournament && (
                  <CreateTournamentDialog
                    open={createOpen}
                    onOpenChange={changeCreateOpen}
                    form={tournamentForm}
                    setForm={setTournamentForm}
                    onSubmit={createTournament}
                    working={working}
                    canUseOfficial={payload.canCreateOfficialTournaments}
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
                  Share this code. Players enter it and register without an
                  account. Before round one, check in every active player.
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
                  <Button variant="outline" onClick={() => setQrOpen(true)} disabled={!tournament?.joinCode}>
                    <span className="qr-button-mark" aria-hidden="true">QR</span> QR code
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
                </div>
              </section>
            ) : snapshot.viewerRole === "player" ? (
              <section className="join-strip participant-strip">
                <div className="join-code-block">
                  <span>YOUR ROLE</span>
                  <strong>PLAYER</strong>
                </div>
                <p>
                  You are registered on this browser. Your previous results stay
                  in the tournament if you later withdraw.
                </p>
                {snapshot.canSelfWithdraw && currentPlayer && !currentPlayer.withdrawn && (
                  <DangerConfirmDialog
                    triggerLabel="Withdraw"
                    title={`Withdraw ${currentPlayer.name} from this tournament?`}
                    description="Previous pairings, results, and statistics will remain. You will not be paired in future rounds. This is different from skipping one round, and only tournament staff can reactivate you."
                    working={working}
                    onConfirm={() =>
                      mutate(
                        { action: "self_withdraw", tournamentId: tournament?.id },
                        "You withdrew from future rounds",
                      )
                    }
                  />
                )}
              </section>
            ) : guestEntry ? (
              <section className="join-strip participant-strip">
                <div className="join-code-block">
                  <span>YOUR ROLE</span>
                  <strong>GUEST</strong>
                </div>
                <p>
                  You joined as a guest ({guestEntry.name}). No account was
                  created; keep your access code to manage this registration.
                </p>
                {(() => {
                  const guestPlayer = snapshot.players.find(
                    (player) => player.id === guestEntry.playerId,
                  );
                  if (guestPlayer?.withdrawn) {
                    return (
                      <span className="checkin-state">Withdrawn</span>
                    );
                  }
                  return (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" disabled={working}>
                          <UserMinus /> Withdraw
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="confirmation-dialog">
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Withdraw from this tournament?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Your previous games and results stay in the
                            tournament history, but you will not be paired in
                            future rounds. Tournament staff can restore you
                            later if allowed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Stay registered</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={withdrawGuestSelf}
                            disabled={working}
                          >
                            Withdraw
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  );
                })()}
              </section>
            ) : null}

            {snapshot && (
              <section className="moderator-strip" aria-label="Tournament staff">
                <div>
                  <span className="section-code">TOURNAMENT STAFF</span>
                  <div className="staff-line">
                    <strong>Organizer</strong>
                    <span>{snapshot.organizerName ?? "Unknown"}</span>
                  </div>
                  <div className="staff-line">
                    <strong>Moderators</strong>
                    <span>
                      {snapshot.moderators.length
                        ? snapshot.moderators.map((moderator) => moderator.displayName).join(", ")
                        : "None delegated"}
                    </span>
                  </div>
                </div>
                <div className="moderator-strip-actions">
                  {snapshot.canJoinDelegation && (
                    <Button
                      variant="outline"
                      disabled={working}
                      onClick={() =>
                        mutate(
                          { action: "join_tournament_delegation", tournamentId: tournament?.id },
                          "Joined tournament delegation",
                        )
                      }
                    >
                      <ShieldCheck /> Join delegation
                    </Button>
                  )}
                  {snapshot.canLeaveDelegation && (
                    <Button
                      variant="outline"
                      disabled={working}
                      onClick={() =>
                        mutate(
                          { action: "leave_tournament_delegation", tournamentId: tournament?.id },
                          "Left tournament delegation",
                        )
                      }
                    >
                      <UserX /> Leave delegation
                    </Button>
                  )}
                  {snapshot.canEdit && snapshot.moderators.length > 0 && (
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
                  )}
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
                label={hasChampion ? "Champion" : "Leader"}
                value={snapshot.standings[0]?.name ?? "—"}
                featured
                accent
                marker={<StandingMarker rank={1} tournament={snapshot.tournament} hasResults={hasStandingResults} saving={savingResultIds.size > 0} />}
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
                      <TabsTrigger value="crosstable">Crosstable</TabsTrigger>
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
                            {isTr
                              ? `${remainingResults} sonuç kaldı`
                              : `${remainingResults} result${remainingResults === 1 ? "" : "s"} remaining`}
                          </span>
                        ) : tournament && savingResultIds.size > 0 ? (
                          <span className="results-remaining is-saving" aria-live="polite">
                            {isTr
                              ? `${savingResultIds.size} sonuç kaydediliyor…`
                              : `Saving ${savingResultIds.size} result${savingResultIds.size === 1 ? "" : "s"}…`}
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
                    {tournament && (
                      <PrintHeader
                        tournament={tournament}
                        title={`Pairings · Round ${viewedRound || 1}`}
                        serverTime={payload.serverTime}
                      />
                    )}
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
                        <PrintAction label="Print / Save PDF" />
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
                    {tournament && (
                      <>
                        <PrintHeader
                          tournament={tournament}
                          title={`Standings · After round ${tournament.currentRound}`}
                          serverTime={payload.serverTime}
                        />
                        <div className="table-print-toolbar">
                          <PrintAction label="Print / Save PDF" />
                        </div>
                      </>
                    )}
                    <div className="standing-table-container">
                      <div className="table-scroll-shell">
                        <Table className="swiss-table standings-table">
                          <TableHeader>
                            <TableRow>
                              <TableHead>#</TableHead>
                              <TableHead>Player</TableHead>
                              <TableHead>Rating</TableHead>
                              <TableHead>Pts</TableHead>
                              <TableHead>BH</TableHead>
                              <TableHead>SB</TableHead>
                              <TableHead className="standings-toggle-head" aria-label="History"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {snapshot.standings.map((standing) => {
                              const isExpanded = historyPlayerId === standing.playerId && !!historySelection?.open;
                              const historyData = historyPlayerId === standing.playerId ? playerHistory : null;

                              return (
                                <Fragment key={standing.playerId}>
                                  <TableRow
                                    id={`player-history-anchor-${standing.playerId}`}
                                    className={isExpanded ? "standings-row-expanded" : undefined}
                                  >
                                    <TableCell className="rank-cell">{standing.rank}</TableCell>
                                    <TableCell className="player-name-cell">
                                      <StandingMarker rank={standing.rank} tournament={snapshot.tournament} hasResults={hasStandingResults} saving={savingResultIds.size > 0} />
                                      {standing.name}
                                    </TableCell>
                                    <TableCell>{standing.rating || "—"}</TableCell>
                                    <TableCell className="score-cell">
                                      {score(standing.score)}
                                    </TableCell>
                                    <TableCell>{score(standing.buchholz)}</TableCell>
                                    <TableCell>{score(standing.sonnebornBerger)}</TableCell>
                                    <TableCell className="standings-toggle-cell">
                                      <button
                                        type="button"
                                        className={`pixel-arrow-btn ${isExpanded ? "expanded" : ""}`}
                                        onClick={() => handleTogglePlayerHistory(standing.playerId)}
                                        aria-expanded={isExpanded}
                                        aria-label={isTr ? `${standing.name} için maç geçmişi` : `Match history for ${standing.name}`}
                                        title={isTr ? `Maç geçmişi: ${standing.name}` : `Match history: ${standing.name}`}
                                      >
                                        <PixelArrow direction={isExpanded ? "up" : "down"} />
                                      </button>
                                    </TableCell>
                                  </TableRow>
                                  {historyData && (
                                    <TableRow className="standings-history-row">
                                      <TableCell colSpan={7} className="standings-history-cell">
                                        <SmoothAccordion isOpen={isExpanded}>
                                          <PlayerHistoryPanel history={historyData} />
                                        </SmoothAccordion>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <div className="standing-mobile-cards" role="region" aria-label="Standings list">
                      {snapshot.standings.map((standing) => {
                        const isExpanded = historyPlayerId === standing.playerId && !!historySelection?.open;
                        const historyData = historyPlayerId === standing.playerId ? playerHistory : null;

                        return (
                          <article
                            key={standing.playerId}
                            id={`player-history-anchor-mobile-${standing.playerId}`}
                            className="standing-card"
                          >
                            <header className="standing-card-header">
                              <div className="standing-card-identity">
                                <span className="standing-card-rank">
                                  #{String(standing.rank).padStart(2, "0")}
                                </span>
                                <StandingMarker
                                  rank={standing.rank}
                                  tournament={snapshot.tournament}
                                  hasResults={hasStandingResults}
                                  saving={savingResultIds.size > 0}
                                />
                                <strong className="standing-card-name">{standing.name}</strong>
                              </div>
                              <button
                                type="button"
                                className={`pixel-arrow-btn ${isExpanded ? "expanded" : ""}`}
                                onClick={() => handleTogglePlayerHistory(standing.playerId)}
                                aria-expanded={isExpanded}
                                aria-label={isTr ? `${standing.name} için maç geçmişi` : `Match history for ${standing.name}`}
                                title={isTr ? `Maç geçmişi: ${standing.name}` : `Match history: ${standing.name}`}
                              >
                                <PixelArrow direction={isExpanded ? "up" : "down"} />
                              </button>
                            </header>

                            <div className="standing-card-body">
                              <div className="standing-card-stats">
                                <span className="standing-badge standing-badge-pts">
                                  {score(standing.score)} {isTr ? "PN" : "PTS"}
                                </span>
                                <span className="standing-badge">
                                  Elo: <strong>{standing.rating || "—"}</strong>
                                </span>
                                <span className="standing-badge">
                                  BH: <strong>{score(standing.buchholz)}</strong>
                                </span>
                                <span className="standing-badge">
                                  SB: <strong>{score(standing.sonnebornBerger)}</strong>
                                </span>
                              </div>
                            </div>

                            {historyData && (
                              <div className="standing-card-history">
                                <SmoothAccordion isOpen={isExpanded}>
                                  <PlayerHistoryPanel history={historyData} />
                                </SmoothAccordion>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </TabsContent>

                  <TabsContent value="crosstable" className="tab-panel">
                    {tournament && (
                      <>
                        <PrintHeader
                          tournament={tournament}
                          title={`Crosstable · After round ${tournament.currentRound}`}
                          serverTime={payload.serverTime}
                        />
                        <div className="table-print-toolbar">
                          <p>Opponent rank · colour · result</p>
                          <PrintAction label="Print / Save PDF" />
                        </div>
                      </>
                    )}
                    <div className="crosstable-scroll" role="region" aria-label="Tournament crosstable" tabIndex={0}>
                      <Table className="swiss-table crosstable-table">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="cross-rank">#</TableHead>
                            <TableHead className="cross-player">Player</TableHead>
                            <TableHead>Rtng</TableHead>
                            {Array.from(
                              { length: tournament?.currentRound ?? 0 },
                              (_, index) => (
                                <TableHead key={index}>R{index + 1}</TableHead>
                              ),
                            )}
                            <TableHead>Pts</TableHead>
                            <TableHead>BH</TableHead>
                            <TableHead>SB</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {crosstableRows.map(({ standing, player, rounds }) => (
                            <TableRow key={player.id}>
                              <TableCell className="rank-cell cross-rank">
                                {standing.rank}
                              </TableCell>
                              <TableCell className="player-name-cell cross-player">
                                <StandingMarker rank={standing.rank} tournament={snapshot.tournament} hasResults={hasStandingResults} saving={savingResultIds.size > 0} />
                                {player.name}
                                {player.isYou && <span className="you-tag">YOU</span>}
                              </TableCell>
                              <TableCell>{standing.rating || "—"}</TableCell>
                              {rounds.map((cell, index) => (
                                <TableCell key={index} title={cell.title}>
                                  <span className={`cross-cell cross-${cell.kind}`}>
                                    {cell.label}
                                  </span>
                                </TableCell>
                              ))}
                              <TableCell className="score-cell">
                                {score(standing.score)}
                              </TableCell>
                              <TableCell>{score(standing.buchholz)}</TableCell>
                              <TableCell>{score(standing.sonnebornBerger)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="players" className="tab-panel">
                    {snapshot.canEdit &&
                      tournament &&
                      (tournament.currentRound === 0 || tournament.status === "between_rounds") && (
                      <form className="player-form" onSubmit={addPlayer}>
                        <label>
                          <span>
                            {tournament.currentRound > 0
                              ? "Late entrant name"
                              : "Guest player name"}
                          </span>
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
                          <Plus /> {tournament.currentRound > 0 ? "Add late entrant" : "Add guest"}
                        </Button>
                      </form>
                    )}

                    <div className="player-table-container">
                      <Table className="swiss-table">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Seed</TableHead>
                            <TableHead>Player</TableHead>
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
                                {!snapshot.canEdit && player.isYou && tournament && (
                                  <div className="player-actions">
                                    {player.withdrawn ? (
                                      <span className="checkin-state">Withdrawn</span>
                                    ) : (
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={working}
                                          >
                                            <UserMinus /> Withdraw
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="confirmation-dialog">
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>
                                              Withdraw from this tournament?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Your previous games and results stay
                                              in the tournament history, but you
                                              will not be paired in future rounds.
                                              Tournament staff can restore you
                                              later if allowed.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Stay registered</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={withdrawSelf}
                                              disabled={working}
                                            >
                                              Withdraw
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="player-mobile-cards" role="region" aria-label="Players list">
                      {snapshot.players.map((player) => (
                        <article key={player.id} className="player-card">
                          <header className="player-card-header">
                            <div className="player-card-identity">
                              <span className="player-card-seed">
                                #{String(player.seed).padStart(2, "0")}
                              </span>
                              {snapshot.canEdit ? (
                                <button
                                  className="player-name-button player-card-name"
                                  type="button"
                                  onClick={() => setManagePlayerId(player.id)}
                                >
                                  {player.name}
                                  {player.isYou && <span className="you-tag">YOU</span>}
                                </button>
                              ) : (
                                <strong className="player-card-name">
                                  {player.name}
                                  {player.isYou && <span className="you-tag">YOU</span>}
                                </strong>
                              )}
                            </div>
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
                          </header>

                          <div className="player-card-body">
                            <div className="player-card-meta">
                              <span>
                                Rating: <strong>{player.rating || "—"}</strong>
                              </span>
                            </div>
                            <div className="player-card-checkin-line">
                              {snapshot.canManageCheckIn && !player.withdrawn ? (
                                <Button
                                  size="sm"
                                  variant={player.checkedIn ? "default" : "outline"}
                                  className="player-card-checkin-btn"
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
                            </div>
                          </div>

                          {(snapshot.canEdit || (player.isYou && tournament)) && (
                            <footer className="player-card-footer">
                              {snapshot.canEdit && tournament && (
                                <div className="player-card-actions">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="player-card-manage-btn"
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
                                      className="player-card-remove-btn"
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
                              {!snapshot.canEdit && player.isYou && tournament && (
                                <div className="player-card-actions">
                                  {player.withdrawn ? (
                                    <span className="checkin-state">Withdrawn</span>
                                  ) : (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={working}
                                        >
                                          <UserMinus /> Withdraw
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent className="confirmation-dialog">
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>
                                            Withdraw from this tournament?
                                          </AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Your previous games and results stay
                                            in the tournament history, but you
                                            will not be paired in future rounds.
                                            Tournament staff can restore you
                                            later if allowed.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Stay registered</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={withdrawSelf}
                                            disabled={working}
                                          >
                                            Withdraw
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </div>
                              )}
                            </footer>
                          )}
                        </article>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </section>

            <footer className="product-note">
              <span>PAIRING METHOD / DUTCH-STYLE SCOREGROUPS</span>
              <span>ACCOUNT-SYNCED D1 STORAGE</span>
              <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                <ThemeToggles />
              </div>
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
            if (!open) {
              setIssuedModeratorToken(null);
              setIssuedModeratorTargetEmail(null);
            }
          }}
          token={issuedModeratorToken}
          targetEmail={issuedModeratorTargetEmail}
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
  marker,
  featured = false,
  accent = false,
}: {
  code: string;
  label: string;
  value: string | number;
  marker?: ReactNode;
  featured?: boolean;
  accent?: boolean;
}) {
  return (
    <article className={`metric ${accent ? "metric-accent" : ""} ${featured ? "metric-featured" : ""}`}>
      <span>{code}</span>
      <p>{label}</p>
      <strong>{marker}<span>{value}</span></strong>
    </article>
  );
}

function PrintHeader({
  tournament,
  title,
  serverTime,
}: {
  tournament: Tournament;
  title: string;
  serverTime: string;
}) {
  return (
    <header className="print-header">
      <p>FREAK SWISS MANAGER</p>
      <h1>{tournament.name}</h1>
      <div>
        <strong>{title}</strong>
        <span>
          {tournament.city} · Generated {new Date(serverTime).toLocaleString()}
        </span>
      </div>
    </header>
  );
}

function PrintAction({ label }: { label: string }) {
  return (
    <Button
      className="print-action"
      variant="outline"
      type="button"
      onClick={() => window.print()}
    >
      <Printer /> {label}
    </Button>
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
      <div className="pairing-table-container">
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
                  className={`status-dot status-indicator ${saving ? "saving" : ""} ${pairing.result !== "*" ? "done" : ""} ${
                    isNoShowResult(pairing.result) ? "forfeit" : ""
                  }`}
                  title={
                    saving
                      ? "Saving… / Kaydediliyor…"
                      : isNoShowResult(pairing.result)
                      ? "No-show / Hükmen"
                      : pairing.result !== "*"
                      ? "Recorded / Kaydedildi"
                      : "Open / Sonuç bekleniyor"
                  }
                  aria-label={
                    saving
                      ? "Saving"
                      : isNoShowResult(pairing.result)
                      ? "No-show"
                      : pairing.result !== "*"
                      ? "Recorded"
                      : "Open"
                  }
                >
                  {saving ? "🔄" : isNoShowResult(pairing.result) ? "⚠️" : pairing.result !== "*" ? "✅" : "⏳"}
                </span>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
        </Table>
      </div>

      <div className="pairing-mobile-cards" role="region" aria-label="Pairings list">
        {pairings.map((pairing) => {
          const saving = savingResultIds.has(pairing.id);
          const whiteScore = scoreByPlayerId.get(pairing.whitePlayerId ?? "") ?? 0;
          const blackScore = pairing.blackPlayerId ? scoreByPlayerId.get(pairing.blackPlayerId) ?? 0 : null;

          return (
            <article key={pairing.id} className="pairing-card">
              <header className="pairing-card-header">
                <span className="pairing-card-board">
                  Board {String(pairing.boardNumber).padStart(2, "0")}
                </span>
                <span
                  className={`status-dot status-indicator ${saving ? "saving" : ""} ${pairing.result !== "*" ? "done" : ""} ${
                    isNoShowResult(pairing.result) ? "forfeit" : ""
                  }`}
                  title={
                    saving
                      ? "Saving… / Kaydediliyor…"
                      : isNoShowResult(pairing.result)
                      ? "No-show / Hükmen"
                      : pairing.result !== "*"
                      ? "Recorded / Kaydedildi"
                      : "Open / Sonuç bekleniyor"
                  }
                  aria-label={
                    saving
                      ? "Saving"
                      : isNoShowResult(pairing.result)
                      ? "No-show"
                      : pairing.result !== "*"
                      ? "Recorded"
                      : "Open"
                  }
                >
                  {saving ? "🔄" : isNoShowResult(pairing.result) ? "⚠️" : pairing.result !== "*" ? "✅" : "⏳"}
                </span>
              </header>

              <div className="pairing-card-body">
                <div className={`pairing-card-player ${pairing.result === "1-0" || pairing.result === "1-BYE" ? "is-lead" : ""}`}>
                  <div className="pairing-card-player-info">
                    <span className="color-chip color-white" aria-label="White" />
                    <strong className="pairing-card-name">{pairing.whiteName}</strong>
                  </div>
                  <span className="pairing-points">{score(whiteScore)} pts</span>
                </div>

                <div className={`pairing-card-player ${pairing.result === "0-1" ? "is-lead" : ""}`}>
                  <div className="pairing-card-player-info">
                    <span className="color-chip color-black" aria-label="Black" />
                    {pairing.blackPlayerId ? (
                      <strong className="pairing-card-name">{pairing.blackName}</strong>
                    ) : (
                      <span className="pairing-card-bye-label">BYE (Unpaired)</span>
                    )}
                  </div>
                  {blackScore !== null && (
                    <span className="pairing-points">{score(blackScore)} pts</span>
                  )}
                </div>
              </div>

              <footer className="pairing-card-footer">
                {pairing.result === "1-BYE" ? (
                  <div className="pairing-card-bye-result">
                    <span className="bye-result">1–0 BYE</span>
                  </div>
                ) : canEdit ? (
                  <div
                    className="result-choice-group pairing-card-choice-group"
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
                  <div className="pairing-card-readonly-result">
                    <span>Result:</span>
                    <strong>{resultLabel(pairing.result)}</strong>
                  </div>
                )}
              </footer>
            </article>
          );
        })}
      </div>
      {canEdit && (
        <p className="pairing-guidance">
          Record each board as 1–0, 0–1 or a draw. The next-round button appears
          only after every board in this round has a result.
        </p>
      )}
    </div>
  );
}

function ProtestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { language } = useLanguage();
  const isTr = language === "tr";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="protest-dialog">
        <DialogHeader>
          <p className="section-code">
            {isTr ? "ÜCRETSİZ / AÇIK / PROTESTO" : "FREE / OPEN / PROTEST"}
          </p>
          <DialogTitle>
            {isTr ? (
              <>
                <span style={{ fontStyle: "italic", textDecoration: "underline" }}>Ücretsiz</span> turnuva yönetimi için bir protesto.
              </>
            ) : (
              <>
                A protest for{" "}
                <span style={{ fontStyle: "italic", textDecoration: "underline" }}>free</span>{" "}
                tournament management.
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isTr
              ? "Freak Swiss Manager'ın net duruşu."
              : "A clear position from Freak Swiss Manager."}
          </DialogDescription>
        </DialogHeader>
        <div className="protest-copy">
          <p className="protest-impact protest-impact-dark">
            {isTr ? (
              <>
                TEMEL TURNUVA YÖNETİMİ İÇİN KONULAN ÜCRETLİ DUVARLARA{" "}
                <span style={{ color: "var(--red)", textDecoration: "underline" }}>
                  SAYGI DUYMUYORUZ
                </span>
                .
              </>
            ) : (
              <>
                <span style={{ color: "var(--red)", textDecoration: "underline" }}>
                  DO NOT RESPECT
                </span>{" "}
                PAYWALLS FOR BASIC TOURNAMENT MANAGEMENT.
              </>
            )}
          </p>
          <p>
            {isTr
              ? "Turnuva oluşturmak, oyuncuları yönetmek, sonuçları kaydetmek, turları oluşturmak, sıralamayı görüntülemek ve bir etkinliği tamamlamak temel işlevlerdir—lüks ayrıcalıklar değil."
              : "Creating a tournament, managing players, recording results, generating rounds, viewing standings, and finishing an event are basic functions—not premium luxuries."}
          </p>
          <p>
            {isTr
              ? "Bu temel özellikleri yapay zekâ veya \"vibe coding\" kullanarak geliştirip ardından sıradan kullanıcılardan gereksiz yere para talep etmek kabul edilemez."
              : "Building these basic features with AI or vibe coding and then demanding unnecessary money from ordinary users is unacceptable."}
          </p>
          <p className="protest-impact">
            {isTr ? (
              <>
                TEMEL TURNUVA YÖNETİMİ{" "}
                <span style={{ fontStyle: "italic", textDecoration: "underline" }}>
                  ÜCRETSİZ
                </span>{" "}
                KALMALIDIR.
              </>
            ) : (
              <>
                CORE TOURNAMENT MANAGEMENT SHOULD REMAIN{" "}
                <span style={{ fontStyle: "italic", textDecoration: "underline" }}>
                  FREE
                </span>
                .
              </>
            )}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isTr ? "Kapat" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TournamentQrDialog({
  open,
  onOpenChange,
  joinCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  joinCode: string;
}) {
  const joinUrl = typeof window === "undefined"
    ? `/guest/join?code=${encodeURIComponent(joinCode)}`
    : `${window.location.origin}/guest/join?code=${encodeURIComponent(joinCode)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="qr-dialog">
        <DialogHeader>
          <p className="section-code">PLAYER / QR ACCESS</p>
          <DialogTitle>Scan to join.</DialogTitle>
          <DialogDescription>
            Players can scan this code with their phone camera to open the tournament entry page.
          </DialogDescription>
        </DialogHeader>
        {joinCode ? (
          <div className="qr-dialog-body">
            <QrCodeImage value={joinUrl} label={`QR code for tournament ${joinCode}`} />
            <div className="qr-join-code">
              <span>PLAYER JOIN CODE</span>
              <strong>{joinCode}</strong>
            </div>
          </div>
        ) : (
          <p className="qr-empty">No join code is available for this tournament.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  onCreateModeratorToken,
  onDeleteModerator,
  onDeleteAccount,
  onBanAccount,
  onRevokeSessions,
  onKickGuest,
  onRevokeGuestAccess,
  onDeleteGuest,
  onBulkDeleteGuests,
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
  tournamentForm: {
    name: string;
    city: string;
    rounds: number;
    visibility: TournamentVisibility;
    playerLimit: number;
  };
  setTournamentForm: React.Dispatch<
    React.SetStateAction<{
      name: string;
      city: string;
      rounds: number;
      visibility: TournamentVisibility;
      playerLimit: number;
    }>
  >;
  createTournament: (event: FormEvent) => void;
  working: boolean;
  onOpenTournament: (tournamentId: string) => void | Promise<void>;
  onJoinTournament: (tournament?: TournamentSummary) => void;
  onRedeemModerator: () => void;
  onCreateModeratorToken: (targetEmail: string) => void | Promise<boolean>;
  onDeleteModerator: (email: string) => void | Promise<boolean>;
  onDeleteAccount: (email: string) => void | Promise<boolean>;
  onBanAccount: (email: string, banned: boolean) => void | Promise<boolean>;
  onRevokeSessions: (email: string) => void | Promise<boolean>;
  onKickGuest: (guest: ManagerPayload["guests"][number]) => void | Promise<boolean>;
  onRevokeGuestAccess: (guest: ManagerPayload["guests"][number]) => void | Promise<boolean>;
  onDeleteGuest: (guest: ManagerPayload["guests"][number]) => void | Promise<boolean>;
  onBulkDeleteGuests: (guests: ManagerPayload["guests"]) => void | Promise<boolean>;
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
          <h1>Free tournament<br />control.</h1>
        </div>
        <div className="library-intro">
          <p>
            Anyone can join a tournament by code without an account. Sign in
            only to create and manage tournaments or activate moderator access.
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
                    canUseOfficial={payload.canCreateOfficialTournaments}
                    prominent
                  />
                )}
                {payload.canRedeemModeratorToken && (
                  <Button variant="outline" onClick={onRedeemModerator}>
                    <ShieldCheck /> Use moderator token
                  </Button>
                )}
              </>
            ) : (
              <a className="signin-link" href={signInPath} target="_top">
                Sign in to create <ArrowRight />
              </a>
            )}
            <Button variant="outline" onClick={() => onJoinTournament()}>
              <KeyRound /> Join with code
            </Button>
          </div>
        </div>
      </section>

      {(payload.authenticated || payload.tournaments.length > 0) && (
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
              <span>Create a tournament or join one with its code.</span>
            </div>
          )}
        </section>
      )}

      {payload.viewerGlobalRole === "superadmin" && (
        <SuperadminDirectory
          payload={payload}
          working={working}
          onCreateModeratorToken={onCreateModeratorToken}
          onDeleteModerator={onDeleteModerator}
          onDeleteAccount={onDeleteAccount}
          onBanAccount={onBanAccount}
          onRevokeSessions={onRevokeSessions}
          onKickGuest={onKickGuest}
          onRevokeGuestAccess={onRevokeGuestAccess}
          onDeleteGuest={onDeleteGuest}
          onBulkDeleteGuests={onBulkDeleteGuests}
          onRevokeToken={onRevokeModeratorToken}
          onDeleteToken={onDeleteModeratorToken}
          onCreateTestTournament={onCreateTestTournament}
          onRefresh={onRefresh}
        />
      )}

      <StaffDirectory staff={payload.publicStaff} />

      <section className="library-section open-section">
        <div className="library-section-title">
          <p className="section-code">
            {payload.authenticated ? "02" : "01"} / OFFICIAL TOURNAMENTS
          </p>
          <span>{payload.openTournaments.length} LISTED</span>
        </div>
        {payload.openTournaments.length ? (
          <div className="tournament-card-grid">
            {payload.openTournaments.map((item) => (
              <TournamentCard
                key={item.id}
                item={item}
                onOpen={onOpenTournament}
                onJoin={
                  item.registrationOpen && item.currentRound === 0
                    ? onJoinTournament
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="empty-library-note">
            <strong>No official tournaments are listed.</strong>
            <span>You can still join a private listing with its six-character code.</span>
          </div>
        )}
      </section>

      <section className="library-section community-section" id="community-tournaments">
        <div className="library-section-title">
          <p className="section-code">COMMUNITY TOURNAMENTS</p>
          <span>{payload.communityTournaments.length} LISTED</span>
        </div>
        {payload.communityTournaments.length ? (
          <div className="tournament-card-grid">
            {payload.communityTournaments.map((item) => (
              <TournamentCard
                key={item.id}
                item={item}
                onOpen={onOpenTournament}
                onJoin={
                  item.registrationOpen && item.currentRound === 0
                    ? onJoinTournament
                    : undefined
                }
              />
            ))}
          </div>
        ) : (
          <div className="empty-library-note">
            <strong>No community tournaments are listed.</strong>
            <span>Private tournaments remain available only through their link or code.</span>
          </div>
        )}
      </section>

      <section className="library-section tournament-archive-section" id="tournament-archive">
        <div className="library-section-title archive-section-title">
          <p className="section-code">
            <Archive aria-hidden="true" /> TOURNAMENT ARCHIVE
          </p>
          <span>
            {payload.archivedOfficialTournaments.length + payload.archivedCommunityTournaments.length} SAVED
          </span>
        </div>
        <div className="archive-library-grid">
          <TournamentArchiveGroup
            title="Official archive"
            tournaments={payload.archivedOfficialTournaments}
            onOpenTournament={onOpenTournament}
          />
          <TournamentArchiveGroup
            title="Community archive"
            tournaments={payload.archivedCommunityTournaments}
            onOpenTournament={onOpenTournament}
          />
        </div>
      </section>

      <div className="library-features">
        <span><Users /> Player registry</span>
        <span><RefreshCw /> Deterministic pairing</span>
        <span><Trophy /> Live standings</span>
        <ThemeToggles />
      </div>
    </div>
  );
}

function TournamentArchiveGroup({
  title,
  tournaments,
  onOpenTournament,
}: {
  title: string;
  tournaments: TournamentSummary[];
  onOpenTournament: (tournamentId: string) => void | Promise<void>;
}) {
  return (
    <section className="archive-library-group" aria-label={title}>
      <header>
        <Archive aria-hidden="true" />
        <h2>{title}</h2>
        <span>{tournaments.length}</span>
      </header>
      {tournaments.length ? (
        <div className="archive-card-list">
          {tournaments.map((item) => (
            <TournamentCard key={item.id} item={item} onOpen={onOpenTournament} />
          ))}
        </div>
      ) : (
        <div className="empty-library-note archive-empty-note">
          <strong>No archived tournaments yet.</strong>
          <span>Finished public tournaments will stay available here.</span>
        </div>
      )}
    </section>
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
        : item.role === "organizer"
          ? "OWNER"
        : item.role === "player"
          ? "PLAYER"
          : "OPEN";

  return (
    <article className="tournament-card">
      <div className="tournament-card-topline">
        <span className={`role-badge role-${item.role}`}>{roleLabel}</span>
        <span className={item.archivedAt ? "archive-card-status" : undefined}>
          {item.archivedAt && <Archive aria-hidden="true" />}
          {item.archivedAt ? "Archived" : statusLabel(item.status)}
        </span>
      </div>
      <h2>{item.name}</h2>
      <p>{item.city || "Location not set"}</p>
      <div className="card-meta">
        <span>{item.playerCount} players</span>
        <span>Round {item.currentRound}/{item.rounds}</span>
        <span>{item.visibility === "official" ? "Official" : item.visibility === "community" ? "Community" : "Private"}</span>
        {(item.role === "superadmin" || item.role === "moderator" || item.role === "organizer") && item.joinCode && (
          <span>Code {item.joinCode}</span>
        )}
      </div>
      <div className="card-actions">
        <Button variant="outline" onClick={() => void onOpen(item.id)}>
          {item.role === "visitor" ? "View" : "Open desk"} <ArrowRight />
        </Button>
        {item.hasJoined || item.role === "player" ? (
          <Button className="tournament-joined-button" disabled>
            <UserCheck /> Joined
          </Button>
        ) : onJoin ? (
          <Button className="tournament-join-button" onClick={() => onJoin(item)}>
            <UserPlus /> Join
          </Button>
        ) : null}
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
  onCreateModeratorToken,
  onDeleteModerator,
  onDeleteAccount,
  onBanAccount,
  onRevokeSessions,
  onKickGuest,
  onRevokeGuestAccess,
  onDeleteGuest,
  onBulkDeleteGuests,
  onRevokeToken,
  onDeleteToken,
  onCreateTestTournament,
  onRefresh,
}: {
  payload: ManagerPayload;
  working: boolean;
  onCreateModeratorToken: (targetEmail: string) => void | Promise<boolean>;
  onDeleteModerator: (email: string) => void | Promise<boolean>;
  onDeleteAccount: (email: string) => void | Promise<boolean>;
  onBanAccount: (email: string, banned: boolean) => void | Promise<boolean>;
  onRevokeSessions: (email: string) => void | Promise<boolean>;
  onKickGuest: (guest: ManagerPayload["guests"][number]) => void | Promise<boolean>;
  onRevokeGuestAccess: (guest: ManagerPayload["guests"][number]) => void | Promise<boolean>;
  onDeleteGuest: (guest: ManagerPayload["guests"][number]) => void | Promise<boolean>;
  onBulkDeleteGuests: (guests: ManagerPayload["guests"]) => void | Promise<boolean>;
  onRevokeToken: (tokenId: string) => void | Promise<boolean>;
  onDeleteToken: (tokenId: string) => void | Promise<boolean>;
  onCreateTestTournament: () => void | Promise<boolean>;
  onRefresh: () => void | Promise<void>;
}) {
  const now = new Date(payload.serverTime).getTime();
  const activeBans = payload.accounts.filter((account) => account.isBanned).length;
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const selectedGuests = payload.guests.filter((guest) => selectedGuestIds.includes(guest.playerId));
  const allGuestsSelected = payload.guests.length > 0 && selectedGuests.length === payload.guests.length;

  function toggleGuestSelection(playerId: string) {
    setSelectedGuestIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId],
    );
  }

  function toggleAllGuests() {
    setSelectedGuestIds(allGuestsSelected ? [] : payload.guests.map((guest) => guest.playerId));
  }

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

  function actionLabel(action: string) {
    return action.replaceAll("_", " ");
  }

  function renderAuditRows(limit?: number) {
    const entries = typeof limit === "number"
      ? payload.moderationAuditLog.slice(0, limit)
      : payload.moderationAuditLog;
    if (!entries.length) return <p className="directory-empty">No moderation activity yet.</p>;
    return (
      <div className="audit-list">
        {entries.map((entry) => (
          <div className="audit-row" key={entry.id}>
            <span>
              <strong>{entry.actorName ?? entry.actorEmail}</strong>
              <small>
                {actionLabel(entry.action)}
                {entry.targetName || entry.targetEmail
                  ? ` · ${entry.targetName ?? entry.targetEmail}`
                  : ""}
                {entry.tournamentName ? ` · ${entry.tournamentName}` : ""}
              </small>
              {entry.detail && <small>{entry.detail}</small>}
            </span>
            <time dateTime={entry.createdAt}>{compactDate(entry.createdAt)}</time>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="library-section admin-directory">
      <div className="library-section-title">
        <div>
          <p className="section-code">SUPERADMIN / ACCESS CONTROL</p>
          <h2><Crown /> Superadmin control desk</h2>
        </div>
        <div className="admin-directory-actions">
          <CreateModeratorTokenDialog
            accounts={payload.accounts.filter((account) => !account.isModerator && !account.isSuperadmin && !account.isBanned)}
            working={working}
            onCreate={onCreateModeratorToken}
          />
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
        Moderator invitations are single-use and expire after seven days. Full
        codes are never stored; this ledger keeps the masked reference, the
        assigned registered email, and exactly who redeemed it.
        Moderators can run every tournament and manage pairings, players, and
        results; only you can change staff, accounts, guests, or site access.
      </p>
      <Tabs defaultValue="overview" className="admin-tabs">
        <TabsList variant="line" className="admin-tabs-list" aria-label="Superadmin sections">
          <TabsTrigger value="overview"><span>01</span> Overview</TabsTrigger>
          <TabsTrigger value="accounts"><span>02</span> Accounts</TabsTrigger>
          <TabsTrigger value="moderators"><span>03</span> Moderators</TabsTrigger>
          <TabsTrigger value="guests"><span>04</span> Guests</TabsTrigger>
          <TabsTrigger value="tokens"><span>05</span> Tokens</TabsTrigger>
          <TabsTrigger value="activity"><span>06</span> Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="admin-tab-panel">
          <div className="admin-overview-grid">
            <div><strong>{payload.accounts.length}</strong><span>Registered accounts</span></div>
            <div><strong>{payload.moderators.length}</strong><span>Moderators</span></div>
            <div><strong>{payload.guests.length}</strong><span>Guest entries</span></div>
            <div><strong>{payload.tournaments.length}</strong><span>Tournaments</span></div>
            <div><strong>{activeBans}</strong><span>Active bans</span></div>
            <div><strong>{payload.moderatorTokens.filter((token) => tokenStatus(token) === "unused").length}</strong><span>Pending tokens</span></div>
          </div>
          <div className="admin-directory-table">
            <h3>Recent moderation activity</h3>
            {renderAuditRows(8)}
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="admin-tab-panel">
          <div className="admin-directory-table">
            <h3>Members / registered accounts</h3>
            {payload.accounts.map((account) => (
              <div className="directory-row" key={account.email}>
                <span>
                  <strong>{account.displayName} · {account.email}</strong>
                  <small>
                    {account.isSuperadmin ? "Superadmin" : account.isModerator ? "Moderator" : "Registered"}
                    {account.isBanned ? " · Banned" : " · Active"}
                  </small>
                </span>
                {account.email !== payload.viewerEmail && (
                  <div className="directory-row-actions">
                    {!account.isModerator && !account.isBanned && (
                      <Button variant="outline" size="sm" disabled={working} onClick={() => void onCreateModeratorToken(account.email)}>
                        <ShieldCheck /> Invite moderator
                      </Button>
                    )}
                    {account.isModerator && (
                      <DangerConfirmDialog
                        triggerLabel="Revoke moderator"
                        title={`Revoke ${account.displayName}'s moderator access?`}
                        description="This removes global moderator access. The registered account remains available."
                        working={working}
                        onConfirm={() => onDeleteModerator(account.email)}
                      />
                    )}
                    <Button variant="outline" size="sm" disabled={working} onClick={() => void onRevokeSessions(account.email)}>
                      <UserX /> Revoke sessions
                    </Button>
                    <DangerConfirmDialog
                      triggerLabel={account.isBanned ? "Unban" : "Ban"}
                      title={`${account.isBanned ? "Unban" : "Ban"} ${account.displayName}?`}
                      description={account.isBanned ? "This restores sign-in access." : "This blocks sign-in, revokes sessions, and removes moderator access."}
                      working={working}
                      onConfirm={() => onBanAccount(account.email, !account.isBanned)}
                      icon={account.isBanned ? "undo" : "trash"}
                    />
                    <DangerConfirmDialog
                      triggerLabel="Delete account"
                      title={`Delete ${account.displayName}'s account?`}
                      description="This removes their app account and moderator access. Existing tournament results remain, but their player entries are detached from the deleted account."
                      working={working}
                      onConfirm={() => onDeleteAccount(account.email)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="moderators" className="admin-tab-panel">
          <div className="admin-directory-table">
            <h3>Moderators</h3>
            {payload.moderators.length ? payload.moderators.map((moderator) => (
              <div className="directory-row" key={moderator.email}>
                <span>
                  <strong>{moderator.displayName} · {moderator.email}</strong>
                  <small>Global tournament access · joined {compactDate(moderator.createdAt)}</small>
                </span>
                <DangerConfirmDialog
                  triggerLabel="Revoke moderator"
                  title={`Revoke moderator access for ${moderator.displayName}?`}
                  description="Their registered account remains available, but all moderator authority is removed."
                  working={working}
                  onConfirm={() => onDeleteModerator(moderator.email)}
                />
              </div>
            )) : <p className="directory-empty">No moderators yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="guests" className="admin-tab-panel">
          <div className="admin-directory-table">
            <div className="guest-directory-heading">
              <div>
                <h3>Guest entries</h3>
                <p>{payload.guests.length} active guest record(s)</p>
              </div>
              {payload.guests.length > 0 && (
                <div className="directory-row-actions">
                  <Button variant="outline" size="sm" disabled={working} onClick={toggleAllGuests}>
                    {allGuestsSelected ? "Clear selection" : "Select all"}
                  </Button>
                  {selectedGuests.length > 0 && (
                    <DangerConfirmDialog
                      triggerLabel={`Delete ${selectedGuests.length} selected`}
                      title={`Delete ${selectedGuests.length} guest entr${selectedGuests.length === 1 ? "y" : "ies"}?`}
                      description="Unpaired guests are deleted. Guests with pairing history are removed from future play and access, while their historical standings and pairings remain."
                      working={working}
                      onConfirm={async () => {
                        const deleted = await onBulkDeleteGuests(selectedGuests);
                        if (deleted) setSelectedGuestIds([]);
                      }}
                    />
                  )}
                </div>
              )}
            </div>
            {payload.guests.length ? payload.guests.map((guest) => (
              <div className="directory-row guest-directory-row" key={`${guest.tournamentId}:${guest.playerId}`}>
                <div className="guest-row-main">
                  <input
                    className="guest-select"
                    type="checkbox"
                    aria-label={`Select ${guest.name} from ${guest.tournamentName}`}
                    checked={selectedGuestIds.includes(guest.playerId)}
                    onChange={() => toggleGuestSelection(guest.playerId)}
                  />
                  <span>
                    <strong>{guest.name} · {guest.tournamentName}</strong>
                    <small>
                      {guest.rating} rating · {guest.withdrawn ? "Kicked / withdrawn" : "Active guest"} · joined {compactDate(guest.createdAt)}
                    </small>
                  </span>
                </div>
                <div className="directory-row-actions">
                  {!guest.withdrawn && (
                    <DangerConfirmDialog
                      triggerLabel="Kick"
                      title={`Kick ${guest.name} from ${guest.tournamentName}?`}
                      description="The guest will be withdrawn from future rounds and their browser access will be revoked."
                      working={working}
                      onConfirm={() => onKickGuest(guest)}
                    />
                  )}
                  <DangerConfirmDialog
                    triggerLabel="Revoke access"
                    title={`Revoke ${guest.name}'s guest access?`}
                    description="Their tournament entry and results remain, but existing guest tokens and sessions stop working."
                    working={working}
                    onConfirm={() => onRevokeGuestAccess(guest)}
                  />
                  <DangerConfirmDialog
                    triggerLabel="Delete"
                    title={`Delete ${guest.name}'s guest entry?`}
                    description="Unpaired entries are deleted. If pairing history exists, the guest is removed from future play and access while standings and pairings remain."
                    working={working}
                    onConfirm={() => onDeleteGuest(guest)}
                  />
                </div>
              </div>
            )) : <p className="directory-empty">No accountless guest entries.</p>}
          </div>
        </TabsContent>

        <TabsContent value="tokens" className="admin-tab-panel">
          <div className="token-ledger">
            <div className="token-ledger-heading">
              <div><h3>Moderator token ledger</h3><p>{payload.moderatorTokens.length} token(s) recorded</p></div>
              <Button variant="outline" size="sm" disabled={working} onClick={() => void onRefresh()}><RefreshCw /> Refresh</Button>
            </div>
            {payload.moderatorTokens.length ? (
              <div className="token-ledger-list">
                {payload.moderatorTokens.map((token) => {
                  const status = tokenStatus(token);
                  return (
                    <article className="token-ledger-row" key={token.id}>
                      <div className="token-ledger-identity"><code>{token.tokenHint ?? "Legacy token"}</code><span className={`token-status token-status-${status}`}>{status}</span></div>
                      <div className="token-ledger-detail">
                        <strong>{token.targetName ?? token.targetEmail ?? "Registered account"}</strong>
                        <small>{token.targetEmail ?? "No target recorded"}</small>
                        <small>Created by {token.createdByName ?? token.createdByEmail}</small>
                        <small>{compactDate(token.createdAt)} · expires {compactDate(token.expiresAt)}</small>
                      </div>
                      <div className="token-ledger-user">
                        {token.usedAt ? <><strong>{token.usedByName ?? token.usedByEmail}</strong><small>{token.usedByEmail}</small><small>Used {compactDate(token.usedAt)}</small></>
                          : token.revokedAt ? <><strong>Revoked</strong><small>By {token.revokedByEmail ?? "superadmin"}</small><small>{compactDate(token.revokedAt)}</small></>
                            : <><strong>No one has used it</strong><small>{status === "expired" ? "Expired without use" : "Waiting for redemption"}</small></>}
                      </div>
                      <div className="token-ledger-actions">
                        {status === "unused" && <DangerConfirmDialog triggerLabel="Revoke" title={`Revoke ${token.tokenHint ?? "this token"}?`} description="It will stop working immediately and cannot be restored." working={working} onConfirm={() => onRevokeToken(token.id)} />}
                        <DangerConfirmDialog triggerLabel="Delete" title={`Permanently delete ${token.tokenHint ?? "this token record"}?`} description="This permanently removes the token record. The moderation activity log remains." working={working} onConfirm={() => onDeleteToken(token.id)} />
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="directory-empty">No moderator tokens yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="admin-tab-panel">
          <div className="admin-directory-table"><h3>Moderation activity log</h3>{renderAuditRows()}</div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function CreateModeratorTokenDialog({
  accounts,
  working,
  onCreate,
}: {
  accounts: ManagerPayload["accounts"];
  working: boolean;
  onCreate: (targetEmail: string) => void | Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [targetEmail, setTargetEmail] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!targetEmail) return;
    const created = await onCreate(targetEmail);
    if (created) {
      setOpen(false);
      setTargetEmail("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={working || accounts.length === 0}>
          <ShieldCheck /> Create moderator token
        </Button>
      </DialogTrigger>
      <DialogContent className="create-dialog">
        <DialogHeader>
          <p className="section-code">SUPERADMIN / MODERATOR INVITATION</p>
          <DialogTitle>Create moderator token</DialogTitle>
          <DialogDescription>
            Choose an existing registered account. Only that email can redeem the
            single-use invitation; it expires after seven days.
          </DialogDescription>
        </DialogHeader>
        <form className="dialog-form" onSubmit={submit}>
          <label>
            <span>Registered account</span>
            <Select value={targetEmail} onValueChange={setTargetEmail}>
              <SelectTrigger><SelectValue placeholder="Choose an account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.email} value={account.email}>
                    {account.displayName} · {account.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <DialogFooter>
            <Button type="submit" disabled={working || !targetEmail}>
              <ShieldCheck /> Create invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StaffDirectory({
  staff,
}: {
  staff: ManagerPayload["publicStaff"];
}) {
  if (!staff.length) return null;
  return (
    <section className="library-section staff-directory">
      <div className="library-section-title">
        <p className="section-code">STAFF / PUBLIC DIRECTORY</p>
        <span>{staff.length} STAFF</span>
      </div>
      <div className="staff-list">
        {staff.map((person, index) => (
          <div className="staff-list-row" key={`${person.role}:${person.displayName}:${index}`}>
            <strong>{person.displayName}</strong>
            <span className={`role-badge role-${person.role}`}>{person.role === "superadmin" ? "SUPERADMIN" : "MODERATOR"}</span>
          </div>
        ))}
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
  icon?: "trash" | "undo" | "archive";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={working}>
          {icon === "undo" ? <Undo2 /> : icon === "archive" ? <Archive /> : <Trash2 />} {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="confirmation-dialog">
        <AlertDialogHeader>
          <p className="section-code">
            {icon === "undo"
              ? "ROUND / CONTROL"
              : icon === "archive"
                ? "TOURNAMENT / ARCHIVE"
                : "CONFIRM / PERMANENT ACTION"}
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
            {icon === "undo" ? <Undo2 /> : icon === "archive" ? <Archive /> : <Trash2 />} Confirm
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
  canUseOfficial,
  prominent = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: {
    name: string;
    city: string;
    rounds: number;
    visibility: TournamentVisibility;
    playerLimit: number;
  };
  setForm: (form: {
    name: string;
    city: string;
    rounds: number;
    visibility: TournamentVisibility;
    playerLimit: number;
  }) => void;
  onSubmit: (event: FormEvent) => void;
  working: boolean;
  canUseOfficial: boolean;
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <label>
              <span>Scheduled rounds</span>
              <WheelPicker
                min={2}
                max={15}
                value={form.rounds}
                onChange={(value) =>
                  setForm({
                    ...form,
                    rounds: value,
                    playerLimit: Math.min(500, Math.pow(2, value)),
                  })
                }
                label="rounds"
              />
            </label>
            <label>
              <span>Player limit</span>
              <WheelPicker
                min={2}
                max={500}
                value={form.playerLimit}
                onChange={(value) => setForm({ ...form, playerLimit: value })}
                label="players"
              />
            </label>
            <div
              style={{
                gridColumn: "span 2",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: "4px 8px",
                fontSize: "0.62rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "var(--quiet)",
                marginTop: "-6px",
                letterSpacing: "0.04em",
              }}
            >
              <span>SWISS: 2^{form.rounds}</span>
              <span>MAX {Math.min(500, Math.pow(2, form.rounds))} PLAYERS</span>
            </div>
          </div>
          <label>
            <span>Visibility</span>
            <Select
              value={form.visibility}
              onValueChange={(value) =>
                setForm({ ...form, visibility: value as TournamentVisibility })
              }
            >
              <SelectTrigger className="form-select-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                className="form-select-content"
                position="popper"
                align="start"
                sideOffset={6}
              >
                {canUseOfficial && <SelectItem value="official">Official / featured</SelectItem>}
                <SelectItem value="community">Community</SelectItem>
                <SelectItem value="private">Private / code-only</SelectItem>
              </SelectContent>
            </Select>
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

function TournamentSettingsDialog({
  tournament,
  canChangeVisibility,
  canUseOfficial,
  working,
  onSave,
}: {
  tournament: Tournament;
  canChangeVisibility: boolean;
  canUseOfficial: boolean;
  working: boolean;
  onSave: (form: {
    name: string;
    city: string;
    rounds: number;
    visibility: TournamentVisibility;
    playerLimit: number;
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: tournament.name,
    city: tournament.city,
    rounds: tournament.rounds,
    visibility: tournament.visibility,
    playerLimit: tournament.playerLimit ?? 0,
  });

  function changeOpen(next: boolean) {
    if (next) {
      setForm({
        name: tournament.name,
        city: tournament.city,
        rounds: tournament.rounds,
        visibility: tournament.visibility,
        playerLimit: tournament.playerLimit ?? 0,
      });
    }
    setOpen(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onSave(form)) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil /> Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="create-dialog">
        <DialogHeader>
          <p className="section-code">TOURNAMENT / SETTINGS</p>
          <DialogTitle>Edit the tournament.</DialogTitle>
          <DialogDescription>
            Update this tournament without changing its players, rounds, or results.
          </DialogDescription>
        </DialogHeader>
        <form className="dialog-form" onSubmit={submit}>
          <label>
            <span>Tournament name</span>
            <Input
              required
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label>
            <span>City / venue</span>
            <Input
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <label>
              <span>Scheduled rounds</span>
              <WheelPicker
                min={Math.max(2, tournament.currentRound)}
                max={15}
                value={form.rounds}
                onChange={(value) => setForm({ ...form, rounds: value })}
                label="rounds"
              />
            </label>
            <label>
              <span>Player limit</span>
              <WheelPicker
                min={2}
                max={500}
                value={form.playerLimit}
                onChange={(value) => setForm({ ...form, playerLimit: value })}
                label="players"
              />
            </label>
            <div
              style={{
                gridColumn: "span 2",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: "4px 8px",
                fontSize: "0.62rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "var(--quiet)",
                marginTop: "-6px",
                letterSpacing: "0.04em",
              }}
            >
              <span>SWISS: 2^{form.rounds}</span>
              <span>MAX {Math.min(500, Math.pow(2, form.rounds))} PLAYERS</span>
            </div>
          </div>
          {canChangeVisibility && (
            <label>
              <span>Visibility</span>
              <Select
                value={form.visibility}
                onValueChange={(value) =>
                  setForm({ ...form, visibility: value as TournamentVisibility })
                }
              >
                <SelectTrigger className="form-select-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className="form-select-content"
                  position="popper"
                  align="start"
                  sideOffset={6}
                >
                  {canUseOfficial && <SelectItem value="official">Official / featured</SelectItem>}
                  <SelectItem value="community">Community</SelectItem>
                  <SelectItem value="private">Private / code-only</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
          <DialogFooter>
            <Button type="submit" disabled={working}>
              Save settings <ArrowRight />
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
    rating: number;
  };
  setForm: (form: {
    tournamentId: string;
    joinCode: string;
    name: string;
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
            This invitation is linked to your registered email. It can be used
            once and grants global tournament-organizer access, not site-wide
            moderation powers.
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
  targetEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  targetEmail: string | null;
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
          <small>Assigned account: {targetEmail ?? "registered account"}</small>
          <code>{token ?? "—"}</code>
          <Button onClick={() => void copyToken()} disabled={!token}>
            <Copy /> Copy token
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
