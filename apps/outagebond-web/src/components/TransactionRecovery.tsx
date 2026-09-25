"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pendingTransaction, recoverTransaction, type PendingWrite } from "@/lib/contract";
import { useWallet } from "./WalletProvider";

export default function TransactionRecovery() {
  const { session } = useWallet();
  const [pending, setPending] = useState<PendingWrite | null>(null);
  const [message, setMessage] = useState("");
  const [href, setHref] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setMessage("");
    setHref("");
    const refresh = () => { try { setPending(session ? pendingTransaction(session) : null); } catch (error) { setMessage(String(error)); } };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener("storage", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("storage", refresh); };
  }, [session]);
  async function recover() {
    if (!session || busy) return;
    setBusy(true);
    try {
      const result = await recoverTransaction(session);
      setMessage(result.message);
      setHref(result.href ?? "");
      setPending(pendingTransaction(session));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  if (!session || (!pending && !message)) return null;
  return <aside className="terms-note" role="status">
    <strong>{pending ? "Saved transaction — check before submitting again" : "Transaction recovery"}</strong>
    {pending ? <><span>{pending.method.replaceAll("_", " ")} · {pending.state}</span><code style={{ overflowWrap: "anywhere" }}>{pending.hash ?? "Waiting for the wallet transaction hash"}</code><button className="button button-secondary" disabled={busy} onClick={() => void recover()}>{busy ? "Checking…" : "Reconcile saved transaction"}</button></> : null}
    {message ? <span>{message}</span> : null}{href ? <Link href={href}>Open finalized record ↗</Link> : null}
  </aside>;
}
