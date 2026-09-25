import { chains } from "genlayer-js";

export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  providers?: EthereumProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
}

export interface WalletOption {
  id: string;
  name: string;
  provider: EthereumProvider;
}

declare global {
  interface Window { ethereum?: EthereumProvider; }
}

function providerName(provider: EthereumProvider): string {
  if (provider.isRabby) return "Rabby Wallet";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return "Browser wallet";
}

export function discoverWallets(host: Window): WalletOption[] {
  const providers = host.ethereum?.providers?.length ? host.ethereum.providers : [host.ethereum];
  return providers.flatMap((provider, index) => provider?.request
    ? [{ id: `${providerName(provider)}-${index}`, name: providerName(provider), provider }]
    : []);
}

function addressFrom(value: unknown): `0x${string}` {
  const address = Array.isArray(value) ? value[0] : undefined;
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/i.test(address)) {
    throw new Error("The wallet returned an invalid account.");
  }
  return address as `0x${string}`;
}

function unknownChain(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; data?: { originalError?: { code?: unknown } } };
  return value.code === 4902 || value.data?.originalError?.code === 4902;
}

export async function connectStudioWallet(provider: EthereumProvider): Promise<`0x${string}`> {
  addressFrom(await provider.request({ method: "eth_requestAccounts" }));
  const chain = chains.studionet;
  const expectedChain = `0x${chain.id.toString(16)}`;
  const currentChain = await provider.request({ method: "eth_chainId" });
  if (typeof currentChain !== "string" || BigInt(currentChain) !== BigInt(chain.id)) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: expectedChain }] });
    } catch (error) {
      if (!unknownChain(error)) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: expectedChain,
          chainName: chain.name,
          rpcUrls: [...chain.rpcUrls.default.http],
          nativeCurrency: chain.nativeCurrency,
          ...(chain.blockExplorers?.default.url ? { blockExplorerUrls: [chain.blockExplorers.default.url] } : {}),
        }],
      });
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: expectedChain }] });
    }
  }
  if (BigInt(String(await provider.request({ method: "eth_chainId" }))) !== BigInt(chain.id)) {
    throw new Error("Switch your wallet to GenLayer StudioNet and reconnect.");
  }
  return addressFrom(await provider.request({ method: "eth_accounts" }));
}
