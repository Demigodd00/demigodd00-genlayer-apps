import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, mock, test } from "node:test";
import { POST } from "../src/app/api/evidence/route";
import { GET } from "../src/app/api/health/route";

const ORIGIN = "https://streakpact.example.com";
const CID = `b${"a".repeat(58)}`;
const envKeys = ["NODE_ENV", "VERCEL", "STREAKPACT_APP_ORIGIN", "PINATA_JWT", "NEXT_PUBLIC_STREAKPACT_V2_ADDRESS", "NEXT_PUBLIC_NETWORK_NAME"];
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  Object.assign(process.env, {
    NODE_ENV: "production",
    VERCEL: "1",
    STREAKPACT_APP_ORIGIN: ORIGIN,
    PINATA_JWT: "unit-test-placeholder-not-a-real-secret",
    NEXT_PUBLIC_STREAKPACT_V2_ADDRESS: `0x${"1".repeat(40)}`,
    NEXT_PUBLIC_NETWORK_NAME: "StudioNet",
  });
  (globalThis as typeof globalThis & { __streakPactEvidenceRates?: Map<string, unknown> })
    .__streakPactEvidenceRates?.clear();
  mock.method(globalThis, "fetch", async () => { throw new Error("Tests must not access the network"); });
});

afterEach(() => {
  mock.restoreAll();
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function upload(contents = "reading completed", type = "text/plain", headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new File([contents], "private-original-name.txt", { type }));
  return new Request(`${ORIGIN}/api/evidence`, {
    method: "POST", body: form,
    headers: { origin: ORIGIN, "x-forwarded-for": "192.0.2.1", ...headers },
  });
}

test("health is ready only when all StudioNet configuration gates are present", async () => {
  const response = await GET();
  const body = await response.json();
  assert.equal(body.readyForStudioNetTesting, true);
  assert.equal(body.originProtectionConfigured, true);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(!JSON.stringify(body).includes(process.env.PINATA_JWT!));
});

for (const origin of ["", "not-an-origin", "http://streakpact.example.com", `${ORIGIN}/path`, `${ORIGIN}?token=bad`, "https://user:password@example.com"]) {
  test(`health rejects an unsafe or missing origin: ${origin || "missing"}`, async () => {
    process.env.STREAKPACT_APP_ORIGIN = origin;
    const body = await (await GET()).json();
    assert.equal(body.originProtectionConfigured, false);
    assert.equal(body.readyForStudioNetTesting, false);
  });
}

test("health rejects the zero address and non-StudioNet labels", async () => {
  process.env.NEXT_PUBLIC_STREAKPACT_V2_ADDRESS = `0x${"0".repeat(40)}`;
  assert.equal((await (await GET()).json()).readyForStudioNetTesting, false);
  process.env.NEXT_PUBLIC_STREAKPACT_V2_ADDRESS = `0x${"1".repeat(40)}`;
  process.env.NEXT_PUBLIC_NETWORK_NAME = "Mainnet";
  assert.equal((await (await GET()).json()).readyForStudioNetTesting, false);
});

test("production uploads fail closed without a valid origin", async () => {
  delete process.env.STREAKPACT_APP_ORIGIN;
  assert.equal((await POST(upload())).status, 503);
});

test("uploads reject cross-origin and missing-origin requests", async () => {
  assert.equal((await POST(upload("ok", "text/plain", { origin: "https://evil.example" }))).status, 403);
  const request = upload();
  request.headers.delete("origin");
  assert.equal((await POST(request)).status, 403);
});

test("uploads fail clearly when the publisher secret is missing", async () => {
  delete process.env.PINATA_JWT;
  assert.equal((await POST(upload())).status, 503);
});

test("declared oversized requests are rejected before parsing", async () => {
  assert.equal((await POST(upload("ok", "text/plain", { "content-length": "220001" }))).status, 413);
});

for (const declaredLength of [undefined, "1"]) {
  test(`actual request limit holds with ${declaredLength ? "false" : "missing"} Content-Length`, async () => {
    const headers = new Headers({ origin: ORIGIN, "content-type": "multipart/form-data; boundary=test" });
    if (declaredLength) headers.set("content-length", declaredLength);
    const request = new Request(`${ORIGIN}/api/evidence`, { method: "POST", headers, body: "x".repeat(220_001) });
    assert.equal((await POST(request)).status, 413);
  });
}

test("file validation rejects empty, oversized and unsupported evidence", async () => {
  assert.equal((await POST(upload(""))).status, 400);
  assert.equal((await POST(upload("x".repeat(100_001)))).status, 413);
  assert.equal((await POST(upload("image bytes", "image/png"))).status, 415);
});

test("malformed multipart bodies and missing files are rejected", async () => {
  const request = new Request(`${ORIGIN}/api/evidence`, { method: "POST", headers: { origin: ORIGIN }, body: "not multipart" });
  assert.equal((await POST(request)).status, 400);
  const missing = new Request(`${ORIGIN}/api/evidence`, { method: "POST", headers: { origin: ORIGIN }, body: new FormData() });
  assert.equal((await POST(missing)).status, 400);
});

test("Vercel limiter ignores spoofed CF and X-Real-IP headers", async () => {
  delete process.env.PINATA_JWT;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await POST(upload("ok", "text/plain", {
      "cf-connecting-ip": `198.51.100.${attempt}`, "x-real-ip": `203.0.113.${attempt}`,
    }))).status, 503);
  }
  const response = await POST(upload("ok", "text/plain", { "cf-connecting-ip": "198.51.100.99" }));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.equal((await POST(upload("ok", "text/plain", { "x-forwarded-for": "192.0.2.2" }))).status, 503);
});

test("publisher preserves bytes, anonymizes filenames and returns a matching digest", async () => {
  const contents = "reading completed";
  const digest = createHash("sha256").update(contents).digest("hex");
  mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(url, "https://uploads.pinata.cloud/v3/files");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${process.env.PINATA_JWT}`);
    const body = init?.body as FormData;
    assert.equal(body.get("network"), "public");
    const file = body.get("file") as File;
    assert.equal(await file.text(), contents);
    assert.equal(file.name, `streakpact-${digest.slice(0, 16)}.txt`);
    return Response.json({ data: { cid: CID, size: contents.length } });
  });
  const response = await POST(upload(contents));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { cid: CID, digest, size: contents.length, url: `https://gateway.pinata.cloud/ipfs/${CID}` });
});

test("upstream errors do not expose credentials or provider response bodies", async () => {
  mock.method(globalThis, "fetch", async () => new Response("private provider detail", { status: 401 }));
  const response = await POST(upload());
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("private provider detail"));
});

test("invalid upstream CIDs and size mismatches are rejected", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ data: { cid: "invalid" } }));
  assert.equal((await POST(upload())).status, 502);
  mock.method(globalThis, "fetch", async () => Response.json({ data: { cid: CID, size: 999 } }));
  assert.equal((await POST(upload())).status, 502);
});
