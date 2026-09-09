import {
  createPasswordRecord,
  createSession,
  isSuperadmin,
  isValidEmail,
  normalizeEmail,
  passwordValidationError,
  sessionCookie,
} from "@/app/auth-server";
import { getDatabase } from "@/db/raw";
import { readJsonRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

type RegistrationBody = {
  displayName?: string;
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const parsed = await readJsonRequest(request);
    if (parsed instanceof Response) return parsed;
    const body = parsed as RegistrationBody;
    if (!body) {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    const email = normalizeEmail(body.email || "");
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
    const password = typeof body.password === "string" ? body.password : "";

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
    // Provision the intended account before assigning SUPERADMIN_EMAIL. Never
    // allow public signup to bootstrap a privileged identity by email alone.
    if (isSuperadmin(email)) {
      return Response.json({ error: "This account must be provisioned by the site administrator." }, { status: 403 });
    }

    const database = getDatabase();
    const existing = await database
      .prepare(`SELECT email FROM user_accounts WHERE email = ?
                UNION ALL SELECT email FROM moderators WHERE email = ?
                UNION ALL SELECT owner_email AS email FROM tournaments WHERE owner_email = ?
                UNION ALL SELECT moderator_email AS email FROM tournament_moderators WHERE moderator_email = ?
                LIMIT 1`)
      .bind(email, email, email, email)
      .first<{ email: string }>();
    if (existing) {
      return Response.json(
        { error: "This account already exists. Sign in or contact the site administrator for recovery." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const passwordRecord = await createPasswordRecord(password);
    await database.batch([
      database
        .prepare(
          `INSERT INTO user_accounts (email, display_name, created_at, last_seen_at)
           VALUES (?, ?, ?, ?)`,
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
    const message = error instanceof Error ? error.message : String(error);
    console.error("Account registration failed", {
      kind: message.includes("no such table") ? "database_schema" : "runtime",
      message,
    });
    if (message.includes("UNIQUE constraint failed") && (message.includes("auth_credentials") || message.includes("user_accounts"))) {
      return Response.json(
        { error: "An account already exists for this email. Sign in instead." },
        { status: 409 },
      );
    }
    if (message.includes("no such table") || message.includes("no column named")) {
      return Response.json(
        { error: "Account registration is temporarily unavailable while the database is upgraded." },
        { status: 503 },
      );
    }
    return Response.json(
      { error: "Unable to create the account right now. Please try again." },
      { status: 500 },
    );
  }
}
