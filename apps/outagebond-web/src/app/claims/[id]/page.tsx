"use client";

import { useParams } from "next/navigation";
import ClaimDetail from "@/components/ClaimDetail";

export default function ClaimPage() {
  const params = useParams<{ id: string }>();
  return <ClaimDetail claimId={decodeURIComponent(params.id)} />;
}
