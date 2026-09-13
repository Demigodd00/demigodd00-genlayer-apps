import type { Metadata } from "next";
import App from "@/components/App";
import "./globals.css";
export const metadata: Metadata = {
  title: "Lacuna — Find the missing fact",
  description:
    "An adversarial abstention range. Pinned rules, blinded GenLayer adjudication, test GEN bounties. By demigodd00.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <App>{children}</App>
      </body>
    </html>
  );
}
