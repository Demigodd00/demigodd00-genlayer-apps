import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ADDRESS,
  CHAIN_ID,
  EXAMPLE,
  campaignStatus,
  commitmentFor,
  gen,
  parseBackup,
  parseGen,
  prepareBackup,
  validateCase,
  validRoute,
} from "../src/lib/protocol";
import { receiptState } from "../src/lib/receipt";
const wallet = `0x${"a".repeat(40)}`;

const openCampaign = {
  status: "OPEN",
  closes_at: "1789299085",
  active_attempt: "",
};
const closingMs = Number(openCampaign.closes_at) * 1000;

test("campaign entry stays open strictly before its deadline", () => {
  assert.deepEqual(campaignStatus(openCampaign, closingMs - 1), {
    text: "open",
    good: true,
  });
});

test("passed entry deadlines do not claim the contract has already closed", () => {
  for (const now of [closingMs, closingMs + 1, closingMs + 86400_000])
    assert.deepEqual(campaignStatus(openCampaign, now), {
      text: "Deadline passed — awaiting closure",
      good: false,
    });
  assert.equal(openCampaign.status, "OPEN");
});

test("an active attempt survives the campaign entry deadline", () => {
  assert.deepEqual(
    campaignStatus({ ...openCampaign, active_attempt: "la-1" }, closingMs),
    { text: "Deadline passed — attempt in progress", good: false },
  );
});

test("terminal and rule-review statuses are not overwritten by elapsed deadlines", () => {
  for (const status of [
    "CLAIMED",
    "EXPIRED",
    "INVALID_RULE",
    "RULE_INCONCLUSIVE",
    "PENDING_RULE",
  ])
    assert.deepEqual(campaignStatus({ ...openCampaign, status }, closingMs + 1), {
      text: status.toLowerCase().replaceAll("_", " "),
      good: false,
    });
});

test("unknown browser time or malformed deadlines never advertise open entry", () => {
  for (const now of [null, NaN, Infinity])
    assert.deepEqual(campaignStatus(openCampaign, now), {
      text: "Checking deadline",
      good: false,
    });
  for (const closes_at of ["", "not-a-date", "-1", "Infinity", "9".repeat(400)])
    assert.deepEqual(campaignStatus({ ...openCampaign, closes_at }, closingMs), {
      text: "Checking deadline",
      good: false,
    });
});

test("route validation rejects malformed IDs and nested false matches", () => {
  for (const path of [
    [],
    ["new"],
    ["protocol"],
    ["campaign", "lc-3"],
    ["attempt", "la-99"],
  ])
    assert.equal(validRoute(path), true);
  for (const path of [
    ["campaign"],
    ["campaign", "lc-0"],
    ["attempt", "lc-1"],
    ["new", "anything"],
    ["campaign", "lc-1", "extra"],
    ["unknown"],
  ])
    assert.equal(validRoute(path), false);
});

test("GEN math is exact, including a single atto", () => {
  for (const value of [
    "0",
    "0.001",
    "0.000000000000000001",
    "10",
    "10000.999999999999999999",
  ])
    assert.equal(gen(parseGen(value)), value);
  for (const value of ["-1", "1e3", "NaN", "0.0000000000000000001", "", "0x1"])
    assert.throws(() => parseGen(value));
});
test("case limits and opposite additions are enforced before committing", () => {
  assert.doesNotThrow(() =>
    validateCase(EXAMPLE.document, EXAMPLE.a, EXAMPLE.b),
  );
  for (const [doc, a, b] of [
    ["short", EXAMPLE.a, EXAMPLE.b],
    [EXAMPLE.document, " ".repeat(7), EXAMPLE.b],
    [EXAMPLE.document, EXAMPLE.a, EXAMPLE.a],
    [EXAMPLE.document, "x".repeat(1201), EXAMPLE.b],
    ["bad\0".repeat(20), EXAMPLE.a, EXAMPLE.b],
  ])
    assert.throws(() => validateCase(doc, a, b));
});
test("commitments match the contract's ordered UTF-8 JSON array", async () => {
  const backup = await prepareBackup(
    "lc-1",
    wallet,
    EXAMPLE.document + ' — café 🧪\n"quoted"',
    EXAMPLE.a,
    EXAMPLE.b,
  );
  const vector = [
    "lacuna-v1",
    "61999",
    ADDRESS.toLowerCase(),
    "lc-1",
    wallet,
    backup.document,
    EXAMPLE.a,
    EXAMPLE.b,
    backup.salt,
  ];
  assert.equal(
    backup.commitment,
    createHash("sha256").update(JSON.stringify(vector), "utf8").digest("hex"),
  );
  assert.match(backup.salt, /^[a-f0-9]{64}$/);
  assert.notEqual(
    backup.salt,
    (
      await prepareBackup(
        "lc-1",
        wallet,
        EXAMPLE.document,
        EXAMPLE.a,
        EXAMPLE.b,
      )
    ).salt,
  );
});
test("UTF-8 vector agrees with Python json.dumps and hashlib", async () => {
  const data = {
    version: 1 as const,
    chain: "61999",
    contract: `0x${"1".repeat(40)}`,
    campaign: "lc-1",
    challenger: wallet,
    document: "Both reviews finished in June — café 🧪.",
    a: "Both finished on June 10.",
    b: "Both finished on June 20.",
    salt: "a3".repeat(32),
  };
  assert.equal(
    await commitmentFor(data),
    "f2f62de387f6ab36fc4053351259240464a6af0871eb0feb06a24dba945fd747",
  );
});
for (const field of [
  "chain",
  "contract",
  "campaign",
  "challenger",
  "document",
  "a",
  "b",
  "salt",
] as const) {
  test(`commitment binds ${field}`, async () => {
    const backup = await prepareBackup(
      "lc-1",
      wallet,
      EXAMPLE.document,
      EXAMPLE.a,
      EXAMPLE.b,
    );
    const changed = {
      ...backup,
      [field]:
        field === "contract" || field === "challenger"
          ? `0x${"b".repeat(40)}`
          : backup[field] + "x",
    };
    assert.notEqual(await commitmentFor(changed), backup.commitment);
    await assert.rejects(parseBackup(JSON.stringify(changed), "lc-1", wallet));
  });
}
test("backup round-trips and wallet addresses are case-insensitive", async () => {
  const backup = await prepareBackup(
    "lc-22",
    wallet,
    EXAMPLE.document,
    EXAMPLE.a,
    EXAMPLE.b,
  );
  assert.deepEqual(
    await parseBackup(
      JSON.stringify(backup),
      "lc-22",
      wallet.toUpperCase().replace("0X", "0x"),
    ),
    backup,
  );
  assert.equal(backup.chain, CHAIN_ID);
});
test("invalid and oversized recovery data fails closed", async () => {
  for (const input of ["{", "null", "{}", "x".repeat(40001)])
    await assert.rejects(parseBackup(input, "lc-1", wallet));
});
test("accepted leader success is not finality; explicit status wins", () => {
  assert.equal(
    receiptState({
      statusName: "ACCEPTED",
      status: 7,
      consensus_data: { leader_receipt: { execution_result: "SUCCESS" } },
    }),
    "pending",
  );
  assert.equal(receiptState({ status: "CANCELED" }), "cancelled");
  assert.equal(receiptState({ statusName: "UNDETERMINED" }), "cancelled");
  assert.equal(receiptState({ status: 7 }), "finalized");
  assert.equal(receiptState({ statusName: "FINALIZED" }), "finalized");
  assert.equal(receiptState(null), "pending");
});
