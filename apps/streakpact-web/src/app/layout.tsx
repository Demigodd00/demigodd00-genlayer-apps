import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StreakPact by demigodd00 — Put conviction behind your goals",
  description:
    "Create evidence-backed accountability pacts settled by independent GenLayer validators.",
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
