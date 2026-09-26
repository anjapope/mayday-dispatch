import Link from "next/link";

export default function EditorialHomePage() {
  return (
    <main className="shell">
      <p className="eyebrow">Dispatch / Editorial workspace</p>
      <h1>Editorial control center</h1>
      <p className="lede">
        Review, revise, approve, and publish incoming research and intelligence products.
      </p>
      <Link className="button-link" href="/editorial/publications">Open publication queue</Link>
      <p><Link href="/editorial/evidence">Open Evidence Library</Link></p>
      <p className="notice">
        The editorial API requires a configured Dispatch editorial credential. This UI never
        bypasses the gateway authorization boundary.
      </p>
    </main>
  );
}
