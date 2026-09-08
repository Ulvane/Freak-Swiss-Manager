export type StoredGuestEntry = {
  tournamentId: string;
  playerId: string;
  token: string;
  name: string;
  expiresAt: string;
};

const STORAGE_KEY = "freak_swiss_guest_registrations";

function readAll(): Record<string, StoredGuestEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredGuestEntry>) : {};
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, StoredGuestEntry>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private browsing, quota); fail silently.
  }
}

/** Persists a guest's tournament access token locally so they can return
 * later to check their status or withdraw without an account. */
export function saveGuestRegistration(entry: StoredGuestEntry) {
  const all = readAll();
  all[entry.tournamentId] = entry;
  writeAll(all);
}

export function getGuestRegistration(tournamentId: string): StoredGuestEntry | null {
  return readAll()[tournamentId] ?? null;
}

export function removeGuestRegistration(tournamentId: string) {
  const all = readAll();
  delete all[tournamentId];
  writeAll(all);
}
