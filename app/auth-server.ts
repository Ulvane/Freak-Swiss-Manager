import { cookies } from "next/headers";

import { getDatabase } from "@/db/raw";

export type AppUser = {
  displayName: string;
  email: string;
};

export const SESSION_COOKIE = "freak_swiss_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const PASSWORD_ITERATIONS = 210_000;

type CredentialRow = {
  email: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  failedAttempts: number;
  lockedUntil: string | null;
};

const encoder = new TextEncoder();

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function getSuperadminEmail() {
  const value = process.env.SUPERADMIN_EMAIL;
  return value && isValidEmail(value)
    ? normalizeEmail(value)
    : null;
}

export function isSuperadmin(email: string | null | undefined) {
  const configuredEmail = getSuperadminEmail();
  return Boolean(
    configuredEmail && email && normalizeEmail(email) === configuredEmail,
  );
}

export function passwordValidationError(password: string) {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 128) return "Use no more than 128 characters.";
  return null;
}

export async function createPasswordRecord(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    passwordHash: await derivePasswordHash(password, salt, PASSWORD_ITERATIONS),
    passwordSalt: toBase64Url(salt),
    passwordIterations: PASSWORD_ITERATIONS,
  };
}

export async function findCredential(email: string) {
  return getDatabase()
    .prepare(
      `SELECT email, password_hash AS passwordHash,
              password_salt AS passwordSalt,
              password_iterations AS passwordIterations,
              failed_attempts AS failedAttempts,
              locked_until AS lockedUntil
       FROM auth_credentials WHERE email = ?`,
    )
    .bind(normalizeEmail(email))
    .first<CredentialRow>();
}

export async function verifyPassword(
  password: string,
  credential: CredentialRow,
) {
  const candidate = await derivePasswordHash(
    password,
    fromBase64Url(credential.passwordSalt),
    Number(credential.passwordIterations),
  );
  return constantTimeEqual(candidate, credential.passwordHash);
}

export async function createSession(email: string) {
  const database = getDatabase();
  const rawToken = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(rawToken);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + SESSION_MAX_AGE_SECONDS * 1000,
  ).toISOString();

  await database.batch([
    database
      .prepare(`DELETE FROM auth_sessions WHERE expires_at <= ?`)
      .bind(now.toISOString()),
    database
      .prepare(
        `INSERT INTO auth_sessions (token_hash, email, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(tokenHash, normalizeEmail(email), expiresAt, now.toISOString()),
  ]);

  return rawToken;
}

export async function deleteSession(rawToken: string | null) {
  if (!rawToken) return;
  await getDatabase()
    .prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`)
    .bind(await sha256(rawToken))
    .run();
}

export async function getAuthenticatedUser(): Promise<AppUser | null> {
  const store = await cookies();
  const rawToken = store.get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;

  const user = await getDatabase()
    .prepare(
      `SELECT ua.email, ua.display_name AS displayName
       FROM auth_sessions session
       JOIN user_accounts ua ON ua.email = session.email
       WHERE session.token_hash = ? AND session.expires_at > ?`,
    )
    .bind(await sha256(rawToken), new Date().toISOString())
    .first<AppUser>();

  return user ?? null;
}

export function sessionCookie(rawToken: string, secure: boolean) {
  return [
    `${SESSION_COOKIE}=${rawToken}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function expiredSessionCookie(secure: boolean) {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}

export function cookieValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

export function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://freak-swiss.invalid");
    return url.origin === "https://freak-swiss.invalid"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
}

export function constantTimeEqual(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
