/** Validate personal names without silently removing prohibited characters. */
export function normalizePersonName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/^ +| +$/g, "")
    .replace(/ +/g, " ");
}

export function isValidPersonName(name: string, maxLength = 100): boolean {
  if (typeof name !== "string") return false;
  return (
    name.length >= 2 &&
    name.length <= maxLength &&
    /^\p{L}[\p{L}\p{M}]*(?: \p{L}[\p{L}\p{M}]*)*$/u.test(name)
  );
}

export const PERSON_NAME_ERROR = "Name Surname must contain letters and spaces only (no numbers or symbols).";

