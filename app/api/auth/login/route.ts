import {
  createSession,
  findCredential,
  isValidEmail,
  normalizeEmail,
  sessionCookie,
  verifyPassword,
} from "@/app/auth-server";
import { getDatabase } from "@/db/raw";
import { readJsonRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const parsed = await readJsonRequest(request);
    if (parsed instanceof Response) return parsed;
    const body = parsed as LoginBody;
    if (!body) {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    const email = normalizeEmail(body.email || "");
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length > 128) return Response.json({ error: "Invalid password length." }, { status: 400 });
    if (!isValidEmail(email) || !password) {
      return invalidLogin();
    }

    const credential = await findCredential(email);
    if (!credential) return invalidLogin();

    const now = new Date();
    const moderation = await getDatabase()
      .prepare(`SELECT status FROM moderation_accounts WHERE email = ?`)
      .bind(email)
      .first<{ status: string }>();
    if (moderation?.status === "banned") return invalidLogin();
    if (credential.lockedUntil && credential.lockedUntil > now.toISOString()) {
      return Response.json(
        { error: "Too many attempts. Try again in 15 minutes." },
        { status: 429 },
      );
    }

    const database = getDatabase();
    // Reserve an attempt atomically before checking the password. Concurrent
    // requests must not all read and overwrite the same failed-attempt count.
    const attempt = await database.prepare(
      `UPDATE auth_credentials
       SET failed_attempts = CASE WHEN locked_until <= ? THEN 1 ELSE failed_attempts + 1 END,
           locked_until = CASE
             WHEN (CASE WHEN locked_until <= ? THEN 0 ELSE failed_attempts END) + 1 >= 7
             THEN ? ELSE NULL END,
           updated_at = ?
       WHERE email = ? AND (locked_until IS NULL OR locked_until <= ?)
       RETURNING email`,
    ).bind(now.toISOString(), now.toISOString(),
      new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      now.toISOString(), email, now.toISOString()).first<{ email: string }>();
    if (!attempt) {
      return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    }
    if (!(await verifyPassword(password, credential))) {
      return invalidLogin();
    }

    await database.batch([
      database
        .prepare(
          `UPDATE auth_credentials
           SET failed_attempts = 0, locked_until = NULL, updated_at = ?
           WHERE email = ?`,
        )
        .bind(now.toISOString(), email),
      database
        .prepare(`UPDATE user_accounts SET last_seen_at = ? WHERE email = ?`)
        .bind(now.toISOString(), email),
    ]);

    const token = await createSession(email);
    const secure = new URL(request.url).protocol === "https:";
    return Response.json(
      { ok: true },
      { headers: { "set-cookie": sessionCookie(token, secure) } },
    );
  } catch {
    return Response.json(
      { error: "Unable to sign in right now. Please try again." },
      { status: 500 },
    );
  }
}

function invalidLogin() {
  return Response.json(
    { error: "Email or password is incorrect." },
    { status: 401 },
  );
}
