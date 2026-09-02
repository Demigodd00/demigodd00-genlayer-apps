"use client";

import AppShell from "@/components/AppShell";
import Dashboard from "@/components/Dashboard";
import { useWallet } from "@/components/WalletProvider";

export default function PactsPage() {
  const { session } = useWallet();
  return <AppShell><section className="workspace"><Dashboard key={session?.address ?? "disconnected"} session={session} refreshToken={0} /></section></AppShell>;
}
