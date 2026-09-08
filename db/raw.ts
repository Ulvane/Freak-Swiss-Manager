import { env } from "cloudflare:workers";

export function getDatabase() {
  if (!env.DB) {
    throw new Error("The tournament database is not available.");
  }

  return env.DB;
}
