import { chains } from "genlayer-js";

export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

function walletAddress(accounts: unknown): `0x${string}` {
  const address = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/i.test(address)) {
    throw new Error("The wallet returned an invalid account.");
  }
  return address as `0x${string}`;
}

function isStudioChain(value: unknown): boolean {
  return typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)
    && BigInt(value) === BigInt(chains.studionet.id);
}

function unknownChain(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; data?: { originalError?: { code?: unknown } } };
  return value.code === 4902 || value.data?.originalError?.code === 4902;
}

export async function connectStudioWallet(provider: EthereumProvider | undefined): Promise<`0x${string}`> {
  if (!provider) throw new Error("Open this site in MetaMask or another compatible wallet browser.");
  walletAddress(await provider.request({ method: "eth_requestAccounts" }));
  const chain = chains.studionet;
  const chainId = `0x${chain.id.toString(16)}`;
  if (!isStudioChain(await provider.request({ method: "eth_chainId" }))) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (error) {
      if (!unknownChain(error)) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: chain.name,
          rpcUrls: [...chain.rpcUrls.default.http],
          nativeCurrency: chain.nativeCurrency,
          ...(chain.blockExplorers?.default.url ? { blockExplorerUrls: [chain.blockExplorers.default.url] } : {}),
        }],
      });
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    }
  }
  if (!isStudioChain(await provider.request({ method: "eth_chainId" }))) {
    throw new Error("Switch your wallet to StudioNet and reconnect.");
  }
  return walletAddress(await provider.request({ method: "eth_accounts" }));
}
