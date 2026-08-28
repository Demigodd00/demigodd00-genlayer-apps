import assert from "node:assert/strict";
import test from "node:test";
import { assertSuccessfulExecution } from "../src/lib/receipt";

// Minimal public SDK receipt shapes captured from the exact StudioNet release.
const successful = {
  hash: "0x75150c29f989626d8cda1833552a70be7e9e167e66d5e09e40b862b428a14436",
  status: 7, result: 6,
  consensus_data: { leader_receipt: [{ execution_result: "SUCCESS", result: { status: "return", payload: { readable: "null" } } }] },
};
const rejected = {
  hash: "0x8081df78dbbf863c8fa0a827974c17e4c738fb58e01cfc481fc7b796595a17d1",
  status: 7, result: 6,
  consensus_data: { leader_receipt: [{ execution_result: "ERROR", result: { status: "rollback", payload: "[EXPECTED] pact is not finalized" } }] },
};

test("a real finalized StudioNet success does not require the absent normalized field", () => {
  assert.doesNotThrow(() => assertSuccessfulExecution(successful));
});

test("a real finalized contract rejection exposes the actionable contract reason", () => {
  assert.throws(() => assertSuccessfulExecution(rejected), /\[EXPECTED\] pact is not finalized/);
});

test("the object leader-receipt representation is supported", () => {
  assert.doesNotThrow(() => assertSuccessfulExecution({ consensus_data: { leader_receipt: { execution_result: "SUCCESS" } } }));
});

test("finality and a numeric result alone never count as successful execution", () => {
  assert.throws(() => assertSuccessfulExecution({ status: 7, result: 6 }), /did not confirm successful execution/);
  assert.throws(() => assertSuccessfulExecution(null), /did not confirm successful execution/);
});

test("an explicit leader rejection wins over a conflicting normalized success", () => {
  assert.throws(() => assertSuccessfulExecution({ ...rejected, txExecutionResultName: "FINISHED_WITH_RETURN" }), /pact is not finalized/);
});

test("normalized successful receipts remain supported when no leader field is present", () => {
  assert.doesNotThrow(() => assertSuccessfulExecution({ txExecutionResultName: "FINISHED_WITH_RETURN" }));
});

test("rollback or VM errors cannot be overridden by an execution success label", () => {
  assert.throws(() => assertSuccessfulExecution({ consensus_data: { leader_receipt: { execution_result: "SUCCESS", result: { status: "rollback", payload: "rolled back" } } } }), /rolled back/);
  assert.throws(() => assertSuccessfulExecution({ consensus_data: { leader_receipt: { execution_result: "SUCCESS", genvm_result: { error_description: "VM failure" } } } }), /VM failure/);
});
