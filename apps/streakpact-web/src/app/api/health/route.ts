import { NextResponse } from "next/server";
import { configuredAppOrigin, contractAddressConfigured } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const address = process.env.NEXT_PUBLIC_STREAKPACT_V2_ADDRESS?.trim() || "";
  const network = process.env.NEXT_PUBLIC_NETWORK_NAME?.trim() || "StudioNet";
  const contractConfigured = contractAddressConfigured(address);
  const evidencePublishingConfigured = Boolean(process.env.PINATA_JWT?.trim());
  const originProtectionConfigured = configuredAppOrigin() !== null;

  return NextResponse.json(
    {
      product: "StreakPact V2",
      network,
      contractConfigured,
      evidencePublishingConfigured,
      originProtectionConfigured,
      readyForStudioNetTesting: network.toLowerCase() === "studionet"
        && contractConfigured
        && evidencePublishingConfigured
        && originProtectionConfigured,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
