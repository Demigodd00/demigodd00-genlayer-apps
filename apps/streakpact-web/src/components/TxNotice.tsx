import type { TxProgress } from "@/lib/contract";

export default function TxNotice({ progress }: { progress: TxProgress | null }) {
  if (!progress) return null;
  return (
    <div className={`tx-notice tx-${progress.state}`} role="status" aria-live="polite">
      <span className="tx-dot" aria-hidden="true" />
      <div>
        <strong>{progress.label}</strong>
        {progress.hash ? <span className="mono">{progress.hash}</span> : null}
      </div>
    </div>
  );
}
