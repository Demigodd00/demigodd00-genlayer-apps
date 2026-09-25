"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CONTRACT_READY, NETWORK_NAME } from "@/lib/contract";
import WalletButton from "./WalletButton";
import TransactionRecovery from "./TransactionRecovery";
import { useWallet } from "./WalletProvider";

const routes = [
  { href: "/", label: "Overview" },
  { href: "/coverage/new", label: "Create coverage" },
  { href: "/status", label: "Protocol status" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { error } = useWallet();
  return <>
    <main><div className="site-shell">
      <header className="topbar">
        <Link href="/" className="brand"><span className="brand-mark">OB</span><span>OutageBond<small>by demigodd00</small></span></Link>
        <nav className="top-links" aria-label="Primary navigation">
          {routes.map((route) => <Link className={(route.href === "/" ? pathname === "/" : pathname.startsWith(route.href)) ? "active" : ""} href={route.href} key={route.href}>{route.label}</Link>)}
        </nav>
        <WalletButton />
      </header>
      <div className="network-banner"><strong>{CONTRACT_READY ? NETWORK_NAME : "Preview mode"}</strong><span>StudioNet GEN has no monetary value</span><span>· historical incident claims</span></div>
      {error ? <p className="form-error wallet-error" role="alert">{error}</p> : null}
      <TransactionRecovery />
      {children}
    </div></main>
    <footer><div className="site-shell footer-inner"><Link className="brand" href="/"><span className="brand-mark">OB</span><span>OutageBond<small>by demigodd00 · StudioNet</small></span></Link><p>Independent incident reports. Validator-settled claims.</p><Link href="/status">Protocol status ↗</Link></div></footer>
  </>;
}
