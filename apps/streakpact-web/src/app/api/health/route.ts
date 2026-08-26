import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export async function GET() {
  const address = process.env.NEXT_PUBLIC_STREAKPACT_V2_ADDRESS?.trim() || "";
  const network = process.env.NEXT_PUBLIC_NETWORK_NAME?.trim() || "StudioNet";
  const contractConfigured = ADDRESS_PATTERN.test(address);
  const evidencePublishingConfigured = Boolean(process.env.PINATA_JWT?.trim());
  const originProtectionConfigured = Boolean(process.env.STREAKPACT_APP_ORIGIN?.trim());

  return NextResponse.json(
    {
      product: "StreakPact V2",
      network,
      contractConfigured,
      evidencePublishingConfigured,
      originProtectionConfigured,
      readyForStudioNetTesting: network.toLowerCase() === "studionet"
        && contractConfigured
        && evidencePublishingConfigured,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
