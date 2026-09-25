/** Deliberately synthetic evidence for repeatable StudioNet acceptance only. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const start = Number(params.get("start"));
  const end = Number(params.get("end"));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= start || end-start > 86400 || end > Math.floor(Date.now()/1000)) {
    return Response.json({ error: "Supply a completed UTC interval of at most 24 hours." }, { status: 400 });
  }
  const text = `Synthetic acceptance record. Service: OutageBond Synthetic API, https://example.com/outagebond-demo. Region: demo. Reported event: unplanned complete outage. Start Unix UTC: ${start}. End Unix UTC: ${end}. Status: recovered.`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
