import {
  createPasswordRecord,
  createSession,
  isValidEmail,
  normalizeEmail,
  passwordValidationError,
  sessionCookie,
} from "@/app/auth-server";
import { getDatabase } from "@/db/raw";

export const dynamic = "force-dynamic";

type RegistrationBody = {
  displayName?: string;
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegistrationBody;
    const email = normalizeEmail(body.email || "");
    const displayName = (body.displayName || "").trim().slice(0, 80);
    const password = body.password || "";

    if (!displayName) {
      return Response.json({ error: "Enter your name." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const passwordError = passwordValidationError(password);
    if (passwordError) {
      return Response.json({ error: passwordError }, { status: 400 });
    }

    const database = getDatabase();
    const existing = await database
      .prepare(`SELECT email FROM auth_credentials WHERE email = ?`)
      .bind(email)
      .first<{ email: string }>();
    if (existing) {
      return Response.json(
        { error: "An account already exists for this email. Sign in instead." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const passwordRecord = await createPasswordRecord(password);
    await database.batch([
      database
        .prepare(
          `INSERT INTO user_accounts (email, display_name, created_at, last_seen_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(email) DO UPDATE SET
             display_name = excluded.display_name,
             last_seen_at = excluded.last_seen_at`,
        )
        .bind(email, displayName, now, now),
      database
        .prepare(
          `INSERT INTO auth_credentials
             (email, password_hash, password_salt, password_iterations,
              failed_attempts, locked_until, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, NULL, ?, ?)`,
        )
        .bind(
          email,
          passwordRecord.passwordHash,
          passwordRecord.passwordSalt,
          passwordRecord.passwordIterations,
          now,
          now,
        ),
    ]);

    const token = await createSession(email);
    const secure = new URL(request.url).protocol === "https:";
    return Response.json(
      { ok: true },
      { headers: { "set-cookie": sessionCookie(token, secure) } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create account";
    return Response.json({ error: message }, { status: 500 });
  }
}
