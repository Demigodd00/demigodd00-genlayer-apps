import assert from "node:assert/strict";
import test from "node:test";
import { hashEvidenceFile, isAddress } from "../src/lib/contract";

test("wallet addresses exclude the zero address", () => {
  assert.equal(isAddress(`0x${"1".repeat(40)}`), true);
  assert.equal(isAddress(`0x${"0".repeat(40)}`), false);
  assert.equal(isAddress("0x1234"), false);
});

test("browser evidence validation matches the contract text boundary", async () => {
  const valid = new File(["é".repeat(8_000)], "boundary.txt", { type: "text/plain" });
  assert.match(await hashEvidenceFile(valid), /^[0-9a-f]{64}$/);
  await assert.rejects(
    hashEvidenceFile(new File(["x".repeat(8_001)], "too-long.txt", { type: "text/plain" })),
    /8,000 characters or fewer/,
  );
  await assert.rejects(
    hashEvidenceFile(new File([new Uint8Array([0xc3, 0x28])], "invalid.txt", { type: "text/plain" })),
    /valid UTF-8/,
  );
});
