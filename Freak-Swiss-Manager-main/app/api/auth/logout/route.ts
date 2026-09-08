import {
  cookieValue,
  deleteSession,
  expiredSessionCookie,
  safeReturnPath,
  SESSION_COOKIE,
} from "@/app/auth-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

export const POST = GET;
