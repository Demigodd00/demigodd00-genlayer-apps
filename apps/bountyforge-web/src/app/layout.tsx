import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BountyForge — Ship code. Earn trust.",
  description: "Permissionless GitHub bounties resolved by comparative consensus on GenLayer.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#08111b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
