import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { publishEvidence } from "../src/lib/evidence";

afterEach(() => mock.restoreAll());

const file = () => new File(['{"activity":"reading"}'], "proof.json", { type: "application/json" });

test("edge rate limits show a concise retry instruction even with a plain-text body", async () => {
  mock.method(globalThis, "fetch", async () => new Response("Too Many Requests", { status: 429 }));
  await assert.rejects(publishEvidence(file()), /Too many uploads\. Wait a minute and try again\./);
});

test("JSON rate limits use the same retry instruction", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ error: "internal limiter" }, { status: 429 }));
  await assert.rejects(publishEvidence(file()), /Too many uploads\. Wait a minute and try again\./);
});

test("proxy failures do not expose HTML to the user", async () => {
  mock.method(globalThis, "fetch", async () => new Response("<html>upstream failure</html>", { status: 503 }));
  await assert.rejects(publishEvidence(file()), /^Error: Evidence publishing is temporarily unavailable\.$/);
});

test("safe API validation errors remain readable", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ error: "Choose a JSON or text file." }, { status: 400 }));
  await assert.rejects(publishEvidence(file()), /Choose a JSON or text file\./);
});

for (const body of [null, "invalid", {}, { cid: "incomplete" }]) {
  test(`invalid success response is rejected: ${JSON.stringify(body)}`, async () => {
    mock.method(globalThis, "fetch", async () => Response.json(body));
    await assert.rejects(publishEvidence(file()), /The evidence service returned an incomplete response\./);
  });
}

test("a valid published file response preserves its fingerprint and URL", async () => {
  const expected = { cid: "bafy-test-fixture", digest: "a".repeat(64), size: 22, url: "https://gateway.pinata.cloud/ipfs/bafy-test-fixture" };
  mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "/api/evidence");
    assert.equal(options.method, "POST");
    assert.ok(options.body instanceof FormData);
    assert.ok(options.body.get("file") instanceof File);
    return Response.json(expected, { status: 201 });
  });
  assert.deepEqual(await publishEvidence(file()), expected);
});
