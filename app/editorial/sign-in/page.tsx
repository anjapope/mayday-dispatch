import type { Metadata } from "next";
import { EditorialSignIn } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Editorial sign in | The Golden Horn",
  robots: { index: false, follow: false, noarchive: true },
};

export default function EditorialSignInPage() {
  return (
    <main className="shell detail">
      <p className="eyebrow">Dispatch / Editorial workspace</p>
      <h1>Sign in</h1>
      <p className="lede">Use your configured Dispatch account credential. Upstream service credentials are not accepted.</p>
      <EditorialSignIn />
    </main>
  );
}
