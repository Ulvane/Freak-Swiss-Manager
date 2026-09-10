import { SESSION_COOKIE } from "@/app/auth-server";

export const BROWSER_ID_COOKIE = "fsm_bid";
export const BROWSER_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

export type VisitorTelemetry = {
  ip: string;
  userAgent: string | null;
  method: string;
  path: string;
  referer: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  latitude: string | null;
  longitude: string | null;
};

export function createBrowserToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function isValidBrowserToken(token: unknown): boolean {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function hashBrowserToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function browserTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === BROWSER_ID_COOKIE) {
      const val = value.join("=");
      return isValidBrowserToken(val) ? val : null;
    }
  }
  return null;
}

export function browserTokenCookie(rawToken: string, secure: boolean): string {
  return [
    `${BROWSER_ID_COOKIE}=${rawToken}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${BROWSER_ID_MAX_AGE_SECONDS}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function browserTokenHeaders(
  request: Request,
  rawToken: string,
  shouldSet: boolean,
): Headers {
  const headers = new Headers();
  if (shouldSet) {
    headers.append(
      "set-cookie",
      browserTokenCookie(rawToken, new URL(request.url).protocol === "https:"),
    );
  }
  return headers;
}

export function getClientIp(request: Request): string {
  // Cloudflare overwrites this header at the edge. Forwarded headers can be
  // supplied by a visitor, so never use them as security evidence.
  return request.headers.get("cf-connecting-ip") || "127.0.0.1";
}

export function extractVisitorTelemetry(request: Request): VisitorTelemetry {
  const url = new URL(request.url);
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf;
  return {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") || null,
    method: request.method,
    path: url.pathname,
    referer: request.headers.get("referer") || null,
    country: typeof cf?.country === "string" ? cf.country : null,
    city: typeof cf?.city === "string" ? cf.city : null,
    region: typeof cf?.region === "string" ? cf.region : null,
    latitude: cf?.latitude != null ? String(cf.latitude) : null,
    longitude: cf?.longitude != null ? String(cf.longitude) : null,
  };
}

function clipped(value: string | null, maxLength: number): string | null {
  return value ? value.slice(0, maxLength) : null;
}

export async function recordVisitorLog(
  database: D1Database,
  telemetry: VisitorTelemetry,
): Promise<void> {
  try {
    const ip = telemetry.ip.slice(0, 64);
    const path = telemetry.path.slice(0, 512);
    const now = new Date();
    await database
      .prepare(
        `INSERT INTO visitor_logs
           (ip, user_agent, method, path, referer, country, city, region, latitude, longitude, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM visitor_logs
           WHERE ip = ? AND path = ? AND created_at > ?
         )`,
      )
      .bind(
        ip,
        clipped(telemetry.userAgent, 512),
        clipped(telemetry.method, 16),
        path,
        clipped(telemetry.referer, 512),
        clipped(telemetry.country, 8),
        clipped(telemetry.city, 100),
        clipped(telemetry.region, 100),
        clipped(telemetry.latitude, 32),
        clipped(telemetry.longitude, 32),
        now.toISOString(),
        ip,
        path,
        new Date(now.getTime() - 60_000).toISOString(),
      )
      .run();
  } catch {
    // Non-blocking telemetry
  }
}

export async function recordPlayerBrowser(
  database: D1Database,
  playerId: string,
  browserHash: string,
  ip?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await database
    .prepare(
      `INSERT INTO player_browser_links (id, player_id, browser_hash, ip, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(player_id, browser_hash) DO UPDATE SET
         ip = excluded.ip,
         last_seen_at = excluded.last_seen_at`,
    )
    .bind(crypto.randomUUID(), playerId, browserHash, clipped(ip || null, 64), now)
    .run();
}

export async function recordAccountBrowser(
  database: D1Database,
  email: string,
  browserHash: string,
  ip?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await database
    .prepare(
      `INSERT INTO account_browser_links (id, email, browser_hash, ip, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email, browser_hash) DO UPDATE SET
         ip = excluded.ip,
         last_seen_at = excluded.last_seen_at`,
    )
    .bind(
      crypto.randomUUID(),
      email.trim().toLowerCase(),
      browserHash,
      clipped(ip || null, 64),
      now,
    )
    .run();
}

export async function banAccountBrowsers(
  database: D1Database,
  email: string,
  reason?: string,
  ip?: string,
): Promise<void> {
  const normEmail = email.trim().toLowerCase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SEVEN_DAYS_MS).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS).toISOString();

  await database.batch([
    database.prepare(`DELETE FROM auth_sessions WHERE email = ?`).bind(normEmail),
    database
      .prepare(
         `INSERT INTO anti_abuse_records
           (id, browser_hash, banned_account_email, banned_player_id, ip, reason, expires_at, created_at)
         SELECT lower(hex(randomblob(16))), abl.browser_hash, ?, NULL, COALESCE(abl.ip, ?), ?, ?, ?
         FROM account_browser_links abl
         WHERE abl.email = ? AND abl.last_seen_at > ?
           AND NOT EXISTS (
             SELECT 1 FROM anti_abuse_records ar
             WHERE ar.browser_hash = abl.browser_hash
               AND ar.banned_account_email = ? AND ar.expires_at > ?
           )`,
      )
      .bind(
        normEmail,
        clipped(ip || null, 64),
        reason || "Account banned",
        expiresAt,
        now.toISOString(),
        normEmail,
        sevenDaysAgo,
        normEmail,
        now.toISOString(),
      ),
  ]);
}

export async function banPlayerBrowsers(
  database: D1Database,
  playerId: string,
  reason?: string,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SEVEN_DAYS_MS).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS).toISOString();
  await database
    .prepare(
      `INSERT INTO anti_abuse_records
         (id, browser_hash, banned_account_email, banned_player_id, ip, reason, expires_at, created_at)
       SELECT lower(hex(randomblob(16))), pbl.browser_hash, NULL, ?, pbl.ip, ?, ?, ?
       FROM player_browser_links pbl
       WHERE pbl.player_id = ? AND pbl.last_seen_at > ?
         AND NOT EXISTS (
           SELECT 1 FROM anti_abuse_records ar
           WHERE ar.browser_hash = pbl.browser_hash
             AND ar.banned_player_id = ? AND ar.expires_at > ?
         )`,
    )
    .bind(
      playerId,
      reason || "Guest kicked",
      expiresAt,
      now.toISOString(),
      playerId,
      sevenDaysAgo,
      playerId,
      now.toISOString(),
    )
    .run();
}

export async function unbanAccountBrowsers(
  database: D1Database,
  email: string,
): Promise<void> {
  const normEmail = email.trim().toLowerCase();
  await database.batch([
    database
      .prepare(`DELETE FROM moderation_accounts WHERE email = ?`)
      .bind(normEmail),
    database
      .prepare(`DELETE FROM anti_abuse_records WHERE banned_account_email = ?`)
      .bind(normEmail),
  ]);
}

export async function banBrowserDirectly(
  database: D1Database,
  browserHash: string,
  email?: string,
  reason?: string,
  ip?: string,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SEVEN_DAYS_MS).toISOString();
  const normEmail = email ? email.trim().toLowerCase() : null;

  const statements = [
    database
      .prepare(
        `INSERT INTO anti_abuse_records
           (id, browser_hash, banned_account_email, banned_player_id, ip, reason, expires_at, created_at)
         SELECT ?, ?, ?, NULL, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM anti_abuse_records
           WHERE browser_hash = ?
             AND banned_account_email IS ? AND expires_at > ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        browserHash,
        normEmail,
        clipped(ip || null, 64),
        reason || "Direct abuse ban",
        expiresAt,
        now.toISOString(),
        browserHash,
        normEmail,
        now.toISOString(),
      ),
  ];

  if (normEmail) {
    statements.push(
      database.prepare(`DELETE FROM auth_sessions WHERE email = ?`).bind(normEmail),
    );
  }

  await database.batch(statements);
}

export async function checkRequestBanned(
  request: Request,
  database: D1Database,
): Promise<{
  banned: boolean;
  telemetry: VisitorTelemetry;
  rawBrowserToken: string;
  browserHash: string;
  isNewToken: boolean;
}> {
  const telemetry = extractVisitorTelemetry(request);
  let rawBrowserToken = browserTokenFromRequest(request);
  let isNewToken = false;
  if (!rawBrowserToken) {
    rawBrowserToken = createBrowserToken();
    isNewToken = true;
  }
  const browserHash = await hashBrowserToken(rawBrowserToken);
  const nowIso = new Date().toISOString();

  // Check if browser hash is banned
  const bannedBrowser = await database
    .prepare(
      `SELECT id FROM anti_abuse_records WHERE browser_hash = ? AND expires_at > ? LIMIT 1`,
    )
    .bind(browserHash, nowIso)
    .first<{ id: string }>();

  if (bannedBrowser) {
    return { banned: true, telemetry, rawBrowserToken, browserHash, isNewToken };
  }

  // Check if active session's account is banned
  const cookieHeader = request.headers.get("cookie") || "";
  let sessionToken: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...val] = part.trim().split("=");
    if (key === SESSION_COOKIE) {
      sessionToken = val.join("=");
      break;
    }
  }

  if (sessionToken) {
    const sessionHash = await hashBrowserToken(sessionToken);
    const bannedSession = await database
      .prepare(
        `SELECT s.email FROM auth_sessions s
         JOIN moderation_accounts ma ON ma.email = s.email
         WHERE s.token_hash = ? AND s.expires_at > ? AND ma.status = 'banned' LIMIT 1`,
      )
      .bind(sessionHash, nowIso)
      .first<{ email: string }>();

    if (bannedSession) {
      // Auto-ban this browser too and delete session
      await banBrowserDirectly(
        database,
        browserHash,
        bannedSession.email,
        "Banned session detected",
        telemetry.ip,
      );
      return { banned: true, telemetry, rawBrowserToken, browserHash, isNewToken };
    }
  }

  return { banned: false, telemetry, rawBrowserToken, browserHash, isNewToken };
}

export async function cleanupExpiredAntiAbuse(
  database: D1Database,
  now = new Date(),
): Promise<void> {
  const nowIso = now.toISOString();
  const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS).toISOString();
  await database.batch([
    database.prepare(`DELETE FROM anti_abuse_records WHERE expires_at <= ?`).bind(nowIso),
    database.prepare(`DELETE FROM account_browser_links WHERE last_seen_at <= ?`).bind(sevenDaysAgo),
    database.prepare(`DELETE FROM player_browser_links WHERE last_seen_at <= ?`).bind(sevenDaysAgo),
    database.prepare(`DELETE FROM visitor_logs WHERE created_at <= ?`).bind(sevenDaysAgo),
  ]);
}

export async function checkServerBan(): Promise<{
  banned: boolean;
  telemetry: VisitorTelemetry;
} | null> {
  try {
    const { cookies, headers } = await import("next/headers");
    const headerStore = await headers();
    const cookieStore = await cookies();
    const rawBrowserToken = cookieStore.get(BROWSER_ID_COOKIE)?.value;
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

    const ip = headerStore.get("cf-connecting-ip") || "127.0.0.1";

    const telemetry: VisitorTelemetry = {
      ip,
      userAgent: headerStore.get("user-agent") || null,
      method: "GET",
      path: "",
      referer: headerStore.get("referer") || null,
      country: null,
      city: null,
      region: null,
      latitude: null,
      longitude: null,
    };

    const { getDatabase } = await import("@/db/raw");
    const database = getDatabase();
    const nowIso = new Date().toISOString();

    if (rawBrowserToken && isValidBrowserToken(rawBrowserToken)) {
      const browserHash = await hashBrowserToken(rawBrowserToken);
      const bannedBrowser = await database
        .prepare(
          `SELECT id FROM anti_abuse_records WHERE browser_hash = ? AND expires_at > ? LIMIT 1`,
        )
        .bind(browserHash, nowIso)
        .first<{ id: string }>();
      if (bannedBrowser) {
        await recordVisitorLog(database, telemetry);
        return { banned: true, telemetry };
      }
    }

    if (sessionToken) {
      const sessionHash = await hashBrowserToken(sessionToken);
      const bannedSession = await database
        .prepare(
          `SELECT s.email FROM auth_sessions s
           JOIN moderation_accounts ma ON ma.email = s.email
           WHERE s.token_hash = ? AND s.expires_at > ? AND ma.status = 'banned' LIMIT 1`,
        )
        .bind(sessionHash, nowIso)
        .first<{ email: string }>();
      if (bannedSession) {
        await recordVisitorLog(database, telemetry);
        return { banned: true, telemetry };
      }
    }

    return null;
  } catch {
    return null;
  }
}
