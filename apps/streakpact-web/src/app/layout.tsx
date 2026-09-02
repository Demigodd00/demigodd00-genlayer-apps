import type { Metadata, Viewport } from "next";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

const appUrl = "https://streakpact-zeta.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "StreakPact by demigodd00",
    template: "%s · StreakPact",
  },
  description:
    "Evidence-backed accountability pacts judged by GenLayer validators on StudioNet.",
  applicationName: "StreakPact",
  authors: [{ name: "demigodd00" }],
  creator: "demigodd00",
  icons: { icon: "/icon.svg" },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "StreakPact",
    title: "StreakPact by demigodd00",
    description: "Make a pact, publish evidence, and let GenLayer validators judge the result.",
  },
  twitter: {
    card: "summary_large_image",
    title: "StreakPact by demigodd00",
    description: "Evidence-backed accountability on GenLayer StudioNet.",
  },
  category: "technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101611",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><WalletProvider>{children}</WalletProvider></body>
    </html>
  );
}
