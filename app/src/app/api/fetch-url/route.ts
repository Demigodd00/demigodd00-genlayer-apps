export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url || !/^https?:\/\//i.test(url)) {
    return new Response("bad url", { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (/^https?:\/\/(localhost|127\.|0\.|\[::1\]|10\.|192\.168\.|169\.254\.)/i.test(parsed.href)) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const upstream = await fetch(parsed.href, { redirect: "follow" });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: { "content-type": "application/octet-stream" },
    });
  } catch (e) {
    return new Response(`upstream error: ${String(e).slice(0, 200)}`, { status: 502 });
  }
}
