import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const PUBLIC_GATEWAY_PREFIX = "https://gateway.pinata.cloud/ipfs/";
const MAX_EVIDENCE_BYTES = 100_000;
const MAX_REQUEST_BYTES = 220_000;
const RATE_WINDOW_MS = 60_000;
const MAX_UPLOADS_PER_WINDOW = 5;
const ALLOWED_TYPES = new Set(["application/json", "text/plain"]);
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,120})$/;

interface RateEntry {
  count: number;
  resetAt: number;
}

interface PinataPayload {
  data?: {
    cid?: unknown;
    size?: unknown;
  };
}

const globalRateStore = globalThis as typeof globalThis & {
  __streakPactEvidenceRates?: Map<string, RateEntry>;
};
const rateStore = globalRateStore.__streakPactEvidenceRates ?? new Map<string, RateEntry>();
globalRateStore.__streakPactEvidenceRates = rateStore;

function json(body: Record<string, unknown>, status: number, extraHeaders: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function requestOriginAllowed(request: Request): boolean {
  const expectedOrigin = process.env.STREAKPACT_APP_ORIGIN?.trim().replace(/\/$/, "");
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (expectedOrigin) return origin === expectedOrigin;
  if (!origin) return true;

  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

function requesterKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local"
  );
}

function consumeRateLimit(key: string): number | null {
  const now = Date.now();
  if (rateStore.size >= 1_000 && !rateStore.has(key)) {
    for (const [storedKey, entry] of rateStore.entries()) {
      if (entry.resetAt <= now) rateStore.delete(storedKey);
    }
    if (rateStore.size >= 1_000) return Math.ceil(RATE_WINDOW_MS / 1000);
  }
  const current = rateStore.get(key);
  if (!current || current.resetAt <= now) {
    rateStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return null;
  }
  if (current.count >= MAX_UPLOADS_PER_WINDOW) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }
  current.count += 1;
  return null;
}

function safeMimeType(file: File): string | null {
  if (ALLOWED_TYPES.has(file.type)) return file.type;
  const lowerName = file.name.toLowerCase();
  if (file.type === "" && lowerName.endsWith(".json")) return "application/json";
  if (file.type === "" && lowerName.endsWith(".txt")) return "text/plain";
  return null;
}

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return json({ error: "Evidence uploads are accepted only from this StreakPact app." }, 403);
  }

  const retryAfter = consumeRateLimit(requesterKey(request));
  if (retryAfter !== null) {
    return json(
      { error: "Too many evidence uploads. Wait a minute and try again." },
      429,
      { "Retry-After": String(retryAfter) },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (declaredLength > MAX_REQUEST_BYTES) {
    return json({ error: "Evidence must be 100 KB or smaller." }, 413);
  }

  const pinataJwt = process.env.PINATA_JWT?.trim();
  if (!pinataJwt) {
    return json(
      { error: "Evidence publishing is not configured yet. The owner must add a restricted PINATA_JWT server secret." },
      503,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "The evidence upload could not be read." }, 400);
  }

  const candidate = form.get("file");
  if (!(candidate instanceof File)) {
    return json({ error: "Choose a JSON or plain-text evidence file." }, 400);
  }
  if (candidate.size === 0) return json({ error: "Evidence cannot be empty." }, 400);
  if (candidate.size > MAX_EVIDENCE_BYTES) {
    return json({ error: "Evidence must be 100 KB or smaller." }, 413);
  }

  const mimeType = safeMimeType(candidate);
  if (!mimeType) {
    return json({ error: "Only JSON and plain-text evidence files are supported." }, 415);
  }

  const bytes = await candidate.arrayBuffer();
  const digest = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const extension = mimeType === "application/json" ? "json" : "txt";
  const publicFile = new File([bytes], `streakpact-${digest.slice(0, 16)}.${extension}`, {
    type: mimeType,
  });
  const uploadBody = new FormData();
  uploadBody.append("network", "public");
  uploadBody.append("file", publicFile);
  uploadBody.append("name", `streakpact-${digest.slice(0, 16)}`);
  uploadBody.append("keyvalues", JSON.stringify({ product: "streakpact", network: "studionet" }));

  let upstream: Response;
  try {
    upstream = await fetch(PINATA_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${pinataJwt}` },
      body: uploadBody,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return json({ error: "The public IPFS publisher is temporarily unreachable." }, 502);
  }

  if (!upstream.ok) {
    return json({ error: "The public IPFS publisher rejected the upload. The owner should check its server credentials." }, 502);
  }

  let payload: PinataPayload;
  try {
    payload = (await upstream.json()) as PinataPayload;
  } catch {
    return json({ error: "The public IPFS publisher returned an invalid response." }, 502);
  }

  const cid = payload.data?.cid;
  const uploadedSize = payload.data?.size;
  if (typeof cid !== "string" || !CID_PATTERN.test(cid)) {
    return json({ error: "The public IPFS publisher did not return a valid content identifier." }, 502);
  }
  if (typeof uploadedSize === "number" && uploadedSize !== candidate.size) {
    return json({ error: "The public IPFS publisher reported an unexpected file size." }, 502);
  }

  return json(
    {
      cid,
      digest,
      size: candidate.size,
      url: `${PUBLIC_GATEWAY_PREFIX}${cid}`,
    },
    201,
  );
}
