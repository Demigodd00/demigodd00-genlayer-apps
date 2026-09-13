"use client";
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section className="panel" style={{ marginTop: 60 }} role="alert">
      <h2>This page could not load.</h2>
      <p>
        Your on-chain records have not changed. Check any pending transaction
        before submitting again.
      </p>
      <button onClick={retry}>Try loading again</button>
    </section>
  );
}
