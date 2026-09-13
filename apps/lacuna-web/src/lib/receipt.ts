function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function receiptState(
  receipt: unknown,
): "finalized" | "cancelled" | "pending" {
  const tx = object(receipt);
  const status = tx.statusName ?? tx.status_name ?? tx.status;
  if (status === "FINALIZED" || status === 7 || status === "7")
    return "finalized";
  if (
    [
      "CANCELED",
      "CANCELLED",
      "UNDETERMINED",
      "UNDETERMINED_BY_TIMEOUT",
    ].includes(String(status))
  )
    return "cancelled";
  return "pending";
}

/** Finality is not execution success. StudioNet returns leader receipts. */
export function assertSuccessfulExecution(receipt: unknown): void {
  const tx = object(receipt);
  const consensus = object(tx.consensus_data ?? tx.consensusData);
  const leaders = consensus.leader_receipt ?? consensus.leaderReceipt;
  const leader = object(Array.isArray(leaders) ? leaders[0] : leaders);
  const result = object(leader.result);
  const vm = object(leader.genvm_result ?? leader.genvmResult);
  const execution = leader.execution_result ?? leader.executionResult;
  const explicitFailure =
    Boolean(tx.error || vm.error_code || vm.error_description) ||
    result.status === "rollback" ||
    result.status === "error";

  if (!explicitFailure && execution === "SUCCESS") return;
  if (
    !explicitFailure &&
    execution === undefined &&
    tx.txExecutionResultName === "FINISHED_WITH_RETURN"
  )
    return;

  const payload = result.payload;
  const candidates = [
    typeof payload === "string" ? payload : object(payload).readable,
    vm.error_description,
    typeof tx.error === "string" ? tx.error : object(tx.error).message,
  ];
  const reason = candidates.find(
    (value) => typeof value === "string" && value.trim(),
  );
  throw new Error(
    typeof reason === "string"
      ? reason
      : "GenLayer did not confirm successful execution. Check the transaction before retrying.",
  );
}
