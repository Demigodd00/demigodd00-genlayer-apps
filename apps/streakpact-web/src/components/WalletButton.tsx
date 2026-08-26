import { NETWORK_NAME, shortenAddress, type WalletSession } from "@/lib/contract";

export default function WalletButton({
  session,
  connecting,
  onConnect,
}: {
  session: WalletSession | null;
  connecting: boolean;
  onConnect: () => void;
}) {
  if (session) {
    return (
      <div className="wallet-connected" aria-label={`Connected account ${session.address}`}>
        <span className="network-dot" aria-hidden="true" />
        <span>
          <small>{NETWORK_NAME}</small>
          <strong>{shortenAddress(session.address)}</strong>
        </span>
      </div>
    );
  }
  return (
    <button className="button button-primary wallet-button" onClick={onConnect} disabled={connecting}>
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
