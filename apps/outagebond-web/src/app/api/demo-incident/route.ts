/** Deliberately synthetic evidence for repeatable StudioNet acceptance only. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const start = Number(params.get("start"));
  const end = Number(params.get("end"));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= start || end-start > 86400 || end > Math.floor(Date.now()/1000)) {
    return Response.json({ error: "Supply a completed UTC interval of at most 24 hours." }, { status: 400 });
  }
  const text = `OutageBond Synthetic API (https://example.com/outagebond-demo), region demo. Synthetic test: unplanned complete outage from Unix ${start} UTC to Unix ${end} UTC. Not a real outage.`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
