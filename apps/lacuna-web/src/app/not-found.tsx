import Link from "next/link";
export default function NotFound() {
  return (
    <section className="panel" style={{ marginTop: 60 }}>
      <p className="eyebrow">404</p>
      <h1>Nothing in this gap.</h1>
      <p>This route does not exist.</p>
      <Link href="/">Return to the range →</Link>
    </section>
  );
}
