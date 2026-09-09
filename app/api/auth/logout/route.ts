import {
  cookieValue,
  deleteSession,
  expiredSessionCookie,
  safeReturnPath,
  SESSION_COOKIE,
} from "@/app/auth-server";
import { validateRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = validateRequestOrigin(request);
  if (rejected) return rejected;
  await deleteSession(cookieValue(request, SESSION_COOKIE));
  const url = new URL(request.url);
  const secure = url.protocol === "https:";
  return new Response(null, {
    status: 303,
    headers: {
      location: safeReturnPath(url.searchParams.get("returnTo")),
      "set-cookie": expiredSessionCookie(secure),
    },
  });
}

export async function GET() {
  return new Response("Use POST to sign out.", { status: 405, headers: { Allow: "POST" } });
}
