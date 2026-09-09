export const MAX_JSON_BODY_BYTES = 64 * 1024;

export function validateRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Requests must come from this site." }, { status: 403 });
  }
  return null;
}

/** Bound the actual stream, not just the caller-controlled Content-Length. */
export async function readJsonRequest(request: Request): Promise<Record<string, unknown> | Response> {
  const rejected = validateRequestOrigin(request);
  if (rejected) return rejected;
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Send an application/json request." }, { status: 415 });
  }
  const tooLarge = () => Response.json({ error: "Request body is too large." }, { status: 413 });
  if (Number(request.headers.get("content-length")) > MAX_JSON_BODY_BYTES) return tooLarge();
  if (!request.body) return Response.json({ error: "Invalid request." }, { status: 400 });
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel();
        return tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // Malformed JSON and aborted bodies are client errors, not server failures.
  } finally {
    reader.releaseLock();
  }
  return Response.json({ error: "Invalid request." }, { status: 400 });
}

export function registrationConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("roster_capacity_exceeded")) {
    return Response.json({ error: "Tournament is full (player limit reached)." }, { status: 409 });
  }
  return null;
}
