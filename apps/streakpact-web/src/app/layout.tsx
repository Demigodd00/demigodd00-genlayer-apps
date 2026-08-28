import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StreakPact by demigodd00 — Put conviction behind your goals",
  description:
    "Make a pact, share proof, and build your streak on GenLayer StudioNet.",
  authors: [{ name: "demigodd00" }],
  creator: "demigodd00",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101611",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
