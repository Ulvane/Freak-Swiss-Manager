export type TournamentVisibility = "official" | "community" | "private";

export type GlobalRole = "superadmin" | "moderator" | "player" | "visitor";

/**
 * Only superadmin and approved moderators may mark a tournament "official"
 * or "featured". Ordinary registered users can only create/keep tournaments
 * as "community" or "private".
 */
export function canSetOfficialVisibility(role: GlobalRole): boolean {
  return role === "superadmin" || role === "moderator";
}

/**
 * Resolve the visibility a caller is allowed to apply. Ordinary users
 * requesting "official" are silently downgraded to "community" so a
 * hidden/tampered frontend value can never grant official status.
 */
export function resolveRequestedVisibility(
  requested: unknown,
  role: GlobalRole,
): TournamentVisibility {
  const normalized =
    typeof requested === "string" ? requested.trim().toLowerCase() : "";
  if (normalized === "private") return "private";
  if (normalized === "official") {
    return canSetOfficialVisibility(role) ? "official" : "community";
  }
  return "community";
}

/**
 * "featured" tournaments are surfaced alongside official ones on the home
 * page. Only staff can flip this flag.
 */
export function resolveFeaturedFlag(
  requestedFeatured: unknown,
  role: GlobalRole,
): boolean {
  return Boolean(requestedFeatured) && canSetOfficialVisibility(role);
}

export function isValidVisibility(value: unknown): value is TournamentVisibility {
  return value === "official" || value === "community" || value === "private";
}
