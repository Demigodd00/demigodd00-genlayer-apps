"use client";

import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import CreatePact from "@/components/CreatePact";
import { useWallet } from "@/components/WalletProvider";

export default function NewPactPage() {
  const router = useRouter();
  const { session } = useWallet();
  return <AppShell><section className="workspace"><CreatePact session={session} onCreated={() => router.push("/pacts")} /></section></AppShell>;
}
