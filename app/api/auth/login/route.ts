import {
  createSession,
  findCredential,
  isValidEmail,
  normalizeEmail,
  sessionCookie,
  verifyPassword,
} from "@/app/auth-server";
import { getDatabase } from "@/db/raw";

export const dynamic = "force-dynamic";

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const email = normalizeEmail(body.email || "");
    const password = body.password || "";
    if (!isValidEmail(email) || !password) {
      return invalidLogin();
    }

    const credential = await findCredential(email);
    if (!credential) return invalidLogin();

    const now = new Date();
    if (credential.lockedUntil && credential.lockedUntil > now.toISOString()) {
      return Response.json(
        { error: "Too many attempts. Try again in 15 minutes." },
        { status: 429 },
      );
    }

    const database = getDatabase();
    if (!(await verifyPassword(password, credential))) {
      const nextFailures = Number(credential.failedAttempts) + 1;
      const lockAccount = nextFailures >= 7;
      await database
        .prepare(
          `UPDATE auth_credentials
           SET failed_attempts = ?, locked_until = ?, updated_at = ?
           WHERE email = ?`,
        )
        .bind(
          lockAccount ? 0 : nextFailures,
          lockAccount
            ? new Date(now.getTime() + 15 * 60 * 1000).toISOString()
            : null,
          now.toISOString(),
          email,
        )
        .run();
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign in";
    return Response.json({ error: message }, { status: 500 });
  }
}

function invalidLogin() {
  return Response.json(
    { error: "Email or password is incorrect." },
    { status: 401 },
  );
}
