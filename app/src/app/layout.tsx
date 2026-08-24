import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StreakPact",
  description: "Staked accountability pacts enforced by an AI jury on GenLayer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
