import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SponsorProof — Evidence-backed sponsorships",
  description: "Agree on public web sponsorship commitments, verify the evidence with GenLayer, and inspect transparent payment allocations on StudioNet.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
