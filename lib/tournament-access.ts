import type { TournamentVisibility } from "@/lib/tournament-types";

export type GlobalRole = "superadmin" | "moderator" | "organizer" | "visitor";

export function canCreateOfficialTournament(role: GlobalRole) {
  return role === "superadmin" || role === "moderator";
}

export function canGrantGlobalModerator(role: GlobalRole) {
  return role === "superadmin" || role === "moderator";
}

export function canRemoveTournamentModerator({
  role,
  ownsTournament,
}: {
  role: GlobalRole;
  ownsTournament: boolean;
}) {
  return role === "superadmin" || ownsTournament;
}

export function isTournamentVisibility(
  value: unknown,
): value is TournamentVisibility {
  return value === "official" || value === "community" || value === "private";
}

export function creationVisibility(
  role: GlobalRole,
  requested: unknown,
): TournamentVisibility {
  const selected = isTournamentVisibility(requested)
    ? requested
    : canCreateOfficialTournament(role)
      ? "official"
      : "community";
  if (selected === "official" && !canCreateOfficialTournament(role)) {
    return "community";
  }
  return selected;
}

export function editableVisibility({
  current,
  requested,
  role,
  ownsTournament,
}: {
  current: TournamentVisibility;
  requested: unknown;
  role: GlobalRole;
  ownsTournament: boolean;
}): TournamentVisibility {
  if (!isTournamentVisibility(requested)) return current;
  if (role !== "superadmin" && !ownsTournament) return current;
  if (requested === "official" && !canCreateOfficialTournament(role)) {
    return "community";
  }
  return requested;
}
