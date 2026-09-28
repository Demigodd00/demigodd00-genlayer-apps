import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATTEST — Claims with something at stake",
  description:
    "A public claims docket where bonds, evidence, and independent GenLayer adjudication make commitments verifiable.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
