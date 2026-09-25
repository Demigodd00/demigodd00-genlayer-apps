import { CONTRACT_ADDRESS, CONTRACT_READY, NETWORK_NAME } from "@/lib/contract";

export async function GET() {
  return Response.json({
    product: "OutageBond",
    release: "0.2.0",
    network: NETWORK_NAME,
    contractAddress: CONTRACT_READY ? CONTRACT_ADDRESS : null,
    contractConfigured: CONTRACT_READY,
    studioNet: NETWORK_NAME.toLowerCase() === "studionet",
    readyForStudioNetTesting: CONTRACT_READY && NETWORK_NAME.toLowerCase() === "studionet",
    verification: "Configuration only; /status reads finalized onchain state. This endpoint does not verify transaction execution.",
    adminSettlement: false,
    fees: false,
    evidenceSources: 2,
  });
}
