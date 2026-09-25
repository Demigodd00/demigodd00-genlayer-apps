export interface PendingWrite {
  id: string;
  method: string;
  args: Array<string | number>;
  value: string;
  state: "signing" | "pending" | "unknown" | "confirmed";
  hash?: string;
}

export interface JournalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class DefinitiveFailure extends Error {}

/** Shared persistent state is retained until execution AND record binding finish. */
export class PendingJournal {
  constructor(private storage: JournalStorage, private key: string) {}

  read(): PendingWrite | null {
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingWrite;
    if (!value.id || !value.method || !Array.isArray(value.args)) throw new Error("Saved transaction is unreadable. Recover it before sending another transaction.");
    return value;
  }

  save(value: PendingWrite): void { this.storage.setItem(this.key, JSON.stringify(value)); }

  acknowledge(id: string): void {
    const saved = this.read();
    if (!saved || saved.id !== id || saved.state !== "confirmed") throw new Error("Transaction has not been reconciled.");
    this.storage.removeItem(this.key);
  }

  async execute(
    intent: Omit<PendingWrite, "state" | "hash">,
    send: () => Promise<string>,
    confirm: (hash: string) => Promise<void>,
  ): Promise<string> {
    if (this.read()) throw new Error("A saved transaction still needs reconciliation. Use the recovery panel before submitting again.");
    const record: PendingWrite = { ...intent, state: "signing" };
    // Fail closed if persistence is unavailable: do not ask the wallet to send.
    this.save(record);
    try {
      record.hash = await send();
      record.state = "pending";
      this.save(record);
      await confirm(record.hash);
      record.state = "confirmed";
      this.save(record);
      return record.hash;
    } catch (error) {
      const rejectedBeforeBroadcast = !record.hash && (error as { code?: number })?.code === 4001;
      if (rejectedBeforeBroadcast || error instanceof DefinitiveFailure) {
        this.storage.removeItem(this.key);
      } else {
        record.state = "unknown";
        this.save(record);
      }
      throw error;
    }
  }
}
