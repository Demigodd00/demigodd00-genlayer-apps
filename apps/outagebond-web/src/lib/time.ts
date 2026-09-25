/** Display committed Unix timestamps explicitly in UTC, never browser local time. */
export function utcLabel(unix: string | number): string {
  const timestamp = Number(unix);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "—";
  const date = new Date(timestamp * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace("T", " ").replace(".000Z", " UTC") : "—";
}
