"use client";

import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import JoinPact from "@/components/JoinPact";
import { useWallet } from "@/components/WalletProvider";

export default function JoinPage() {
  const router = useRouter();
  const { session } = useWallet();
  return <AppShell><section className="workspace"><JoinPact session={session} onJoined={() => router.push("/pacts")} /></section></AppShell>;
}
