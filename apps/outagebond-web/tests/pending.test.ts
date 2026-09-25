import assert from "node:assert/strict";
import test from "node:test";
import { PendingJournal, DefinitiveFailure, type JournalStorage } from "../src/lib/pending";
import { assertSuccessfulExecution } from "../src/lib/receipt";

function memory(): JournalStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
const intent = { id: "original-request", method: "create_coverage", args: ["Service", "original-ref", 300], value: "1000000000000000" };

test("timeout preserves hash, original reference and terms across reload; blocks a second deposit", async () => {
  const storage = memory();
  const journal = new PendingJournal(storage, "wallet-chain-contract");
  let sends = 0;
  await assert.rejects(journal.execute(intent, async () => { sends++; return "0xoriginal"; }, async () => { throw new Error("timeout"); }), /timeout/);
  const reloaded = new PendingJournal(storage, "wallet-chain-contract");
  assert.deepEqual(reloaded.read(), { ...intent, hash: "0xoriginal", state: "unknown" });
  await assert.rejects(reloaded.execute({ ...intent, id: "second", args: ["new-ref"] }, async () => { sends++; return "0xsecond"; }, async () => {}), /reconciliation/);
  assert.equal(sends, 1);
});
test("finalized success stays locked until record binding is acknowledged", async () => {
  const journal = new PendingJournal(memory(), "wallet");
  const hash = await journal.execute(intent, async () => "0xsuccessful", async () => {});
  assert.equal(hash, "0xsuccessful");
  assert.equal(journal.read()?.state, "confirmed");
  assert.throws(() => journal.acknowledge("wrong-request"), /not been reconciled/);
  await assert.rejects(journal.execute(intent, async () => "duplicate", async () => {}), /reconciliation/);
  journal.acknowledge(intent.id);
  assert.equal(journal.read(), null);
});
test("RPC error before returning a hash is ambiguous and cannot unlock a duplicate", async () => {
  const journal = new PendingJournal(memory(), "wallet");
  await assert.rejects(journal.execute(intent, async () => { throw new Error("socket lost"); }, async () => {}));
  assert.equal(journal.read()?.state, "unknown");
  assert.equal(journal.read()?.args[1], "original-ref");
  assert.throws(() => journal.acknowledge(intent.id));
});
test("an explicit wallet rejection before broadcast safely clears the intent", async () => {
  const journal = new PendingJournal(memory(), "wallet");
  await assert.rejects(journal.execute(intent, async () => { throw Object.assign(new Error("rejected"), { code: 4001 }); }, async () => {}));
  assert.equal(journal.read(), null);
});
test("a proven terminal execution failure safely clears the intent", async () => {
  const journal = new PendingJournal(memory(), "wallet");
  await assert.rejects(journal.execute(intent, async () => "0xfailed", async () => { throw new DefinitiveFailure("execution reverted"); }));
  assert.equal(journal.read(), null);
});
test("storage failure prevents the wallet send", async () => {
  const storage = memory();
  storage.setItem = () => { throw new Error("storage unavailable"); };
  let sends = 0;
  await assert.rejects(new PendingJournal(storage, "wallet").execute(intent, async () => { sends++; return "hash"; }, async () => {}));
  assert.equal(sends, 0);
});
test("wallet/network/contract storage keys isolate unrelated submissions", async () => {
  const storage = memory();
  const first = new PendingJournal(storage, "walletA-chainA-contractA");
  const second = new PendingJournal(storage, "walletB-chainA-contractA");
  await first.execute(intent, async () => "hashA", async () => {});
  await second.execute(intent, async () => "hashB", async () => {});
  assert.equal(first.read()?.hash, "hashA");
  assert.equal(second.read()?.hash, "hashB");
});
test("malformed saved state fails closed", async () => {
  const storage = memory();
  storage.setItem("wallet", "{}");
  let sends = 0;
  await assert.rejects(new PendingJournal(storage, "wallet").execute(intent, async () => { sends++; return "hash"; }, async () => {}));
  assert.equal(sends, 0);
});
test("finality alone is not execution success", () => {
  assert.throws(() => assertSuccessfulExecution({ status: "FINALIZED" }));
  assert.throws(() => assertSuccessfulExecution({ status: "FINALIZED", consensus_data: { leader_receipt: [{ execution_result: "ERROR", result: { status: "rollback", payload: "Rejected" } }] } }), /Rejected/);
  assert.doesNotThrow(() => assertSuccessfulExecution({ consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] } }));
  assert.doesNotThrow(() => assertSuccessfulExecution({ txExecutionResultName: "FINISHED_WITH_RETURN" }));
  assert.throws(() => assertSuccessfulExecution({ txExecutionResultName: "FINISHED_WITH_RETURN", error: "execution failed" }));
});
