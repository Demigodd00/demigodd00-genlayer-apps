import { read } from "@/lib/contract";
import { ADDRESS, type Stats } from "@/lib/protocol";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const stats = await read<Stats>("get_stats");
    const ok =
      stats.version === "0.1.1-studionet" && stats.accounting_balanced === true;
    return Response.json(
      {
        ok,
        product: "Lacuna",
        network: "StudioNet",
        chain_id: 61999,
        contract: ADDRESS,
        stats,
        test_value_only: true,
      },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        product: "Lacuna",
        contract: ADDRESS,
        error: "StudioNet read unavailable",
      },
      { status: 503 },
    );
  }
}
