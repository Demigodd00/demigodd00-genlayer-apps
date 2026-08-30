import { shortenAddress, type WalletSession } from "@/lib/contract";

export default function WalletButton({ session, connecting, onConnect }: { session: WalletSession | null; connecting: boolean; onConnect: () => void }) {
  return (
    <button className="wallet-button" onClick={onConnect} disabled={connecting}>
      <span className={session ? "wallet-dot connected" : "wallet-dot"} />
      {connecting ? "Connecting…" : session ? shortenAddress(session.address) : "Connect wallet"}
    </button>
  );
}
