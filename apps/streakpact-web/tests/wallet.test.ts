import assert from "node:assert/strict";
import test from "node:test";
import { connectStudioWallet, discoverWalletProviders, type EthereumProvider, type WalletDiscoveryHost } from "../src/lib/wallet";

const account = `0x${"1".repeat(40)}` as const;
const otherAccount = `0x${"2".repeat(40)}` as const;
const studioId = "0xf22f";
type Request = Parameters<EthereumProvider["request"]>[0];

function mockWallet(options: { chain?: string; unknown?: boolean; reject?: boolean; ignoreSwitch?: boolean; accounts?: unknown; currentAccounts?: unknown } = {}) {
  const calls: Request[] = [];
  let chain = options.chain ?? studioId;
  let known = !options.unknown;
  const provider: EthereumProvider = {
    request: async (request) => {
      calls.push(request);
      switch (request.method) {
        case "eth_requestAccounts": return options.accounts ?? [account];
        case "eth_accounts": return options.currentAccounts ?? [account];
        case "eth_chainId": return chain;
        case "wallet_switchEthereumChain":
          if (options.reject) throw Object.assign(new Error("User rejected the request"), { code: 4001 });
          if (!known) throw Object.assign(new Error("Unknown chain"), { code: 4902 });
          if (!options.ignoreSwitch) chain = studioId;
          return null;
        case "wallet_addEthereumChain": known = true; return null;
        default: throw new Error(`Unexpected wallet method: ${request.method}`);
      }
    },
  };
  return { provider, calls };
}

test("a wallet already on StudioNet connects without any Snap or network-install request", async () => {
  const wallet = mockWallet();
  assert.equal(await connectStudioWallet(wallet.provider), account);
  assert.deepEqual(wallet.calls.map((call) => call.method), ["eth_requestAccounts", "eth_chainId", "eth_chainId", "eth_accounts"]);
});

test("a known StudioNet network is switched without re-adding it", async () => {
  const wallet = mockWallet({ chain: "0x1" });
  assert.equal(await connectStudioWallet(wallet.provider), account);
  assert.deepEqual(wallet.calls.find((call) => call.method === "wallet_switchEthereumChain")?.params, [{ chainId: studioId }]);
  assert.equal(wallet.calls.some((call) => call.method === "wallet_addEthereumChain"), false);
});

test("an unknown network is added with the official StudioNet RPC and then verified", async () => {
  const wallet = mockWallet({ chain: "0x1", unknown: true });
  assert.equal(await connectStudioWallet(wallet.provider), account);
  const params = wallet.calls.find((call) => call.method === "wallet_addEthereumChain")?.params as Record<string, unknown>[];
  assert.equal(params[0].chainId, studioId);
  assert.deepEqual(params[0].rpcUrls, ["https://studio.genlayer.com/api"]);
  assert.equal((params[0].nativeCurrency as { symbol: string }).symbol, "GEN");
  assert.equal(wallet.calls.filter((call) => call.method === "wallet_switchEthereumChain").length, 2);
});

test("rejecting a network switch does not trigger an install or another approval", async () => {
  const wallet = mockWallet({ chain: "0x1", reject: true });
  await assert.rejects(connectStudioWallet(wallet.provider), /User rejected/);
  assert.equal(wallet.calls.some((call) => call.method === "wallet_addEthereumChain"), false);
  assert.equal(wallet.calls.some((call) => call.method === "eth_accounts"), false);
});

test("a provider that ignores switching cannot create a wrong-network session", async () => {
  const wallet = mockWallet({ chain: "0x1", ignoreSwitch: true });
  await assert.rejects(connectStudioWallet(wallet.provider), /Switch your wallet to StudioNet/);
});

test("an account change during network approval uses the current authorized account", async () => {
  const wallet = mockWallet({ chain: "0x1", currentAccounts: [otherAccount] });
  assert.equal(await connectStudioWallet(wallet.provider), otherAccount);
});

test("a missing provider and invalid or disconnected accounts fail clearly", async () => {
  await assert.rejects(connectStudioWallet(undefined), /No compatible browser wallet/);
  for (const accounts of [[], ["invalid"], [`0x${"0".repeat(40)}`], { account }]) {
    await assert.rejects(connectStudioWallet(mockWallet({ accounts }).provider), /invalid account/);
  }
  await assert.rejects(connectStudioWallet(mockWallet({ currentAccounts: [] }).provider), /invalid account/);
});

test("multiple injected wallets are returned separately with MetaMask first", async () => {
  const metaMask = { ...mockWallet().provider, isMetaMask: true };
  const rabby = { ...mockWallet().provider, isRabby: true };
  const host = {
    ethereum: { request: async () => null, providers: [rabby, metaMask] },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  } as WalletDiscoveryHost;
  const choices = await discoverWalletProviders(host, async () => {});
  assert.deepEqual(choices.map(({ name }) => name), ["MetaMask", "Rabby Wallet"]);
  assert.equal(choices[0].provider, metaMask);
  assert.equal(choices[1].provider, rabby);
});

test("EIP-6963 announcements are discovered and deduplicated against legacy injection", async () => {
  const metaMask = { ...mockWallet().provider, isMetaMask: true };
  let listener: EventListener | undefined;
  const host = {
    ethereum: metaMask,
    addEventListener: (_type: string, next: EventListener) => { listener = next; },
    removeEventListener: (_type: string, next: EventListener) => { if (listener === next) listener = undefined; },
    dispatchEvent: () => {
      listener?.({ detail: { info: { uuid: "metamask-1", name: "MetaMask", rdns: "io.metamask" }, provider: metaMask } } as CustomEvent);
      return true;
    },
  } as WalletDiscoveryHost;
  const choices = await discoverWalletProviders(host, async () => {});
  assert.equal(choices.length, 1);
  assert.equal(choices[0].id, "eip6963:metamask-1");
  assert.equal(choices[0].rdns, "io.metamask");
  assert.equal(listener, undefined);
});
