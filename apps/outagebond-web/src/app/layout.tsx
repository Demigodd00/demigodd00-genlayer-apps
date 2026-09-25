import type { Metadata, Viewport } from "next";
import { WalletProvider } from "@/components/WalletProvider";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OutageBond by demigodd00", template: "%s · OutageBond" },
  description: "Service incident compensation backed by collateral and independently verified on GenLayer StudioNet.",
  applicationName: "OutageBond",
  authors: [{ name: "demigodd00" }],
  creator: "demigodd00",
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "OutageBond",
    title: "OutageBond by demigodd00",
    description: "Two incident reports. One validator-verified compensation outcome.",
  },
  twitter: { card: "summary_large_image", title: "OutageBond", description: "Incident claims settled by GenLayer validators." },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a1015" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><WalletProvider><AppShell>{children}</AppShell></WalletProvider></body></html>;
}
