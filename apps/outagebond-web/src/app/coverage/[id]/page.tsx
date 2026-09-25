"use client";

import { useParams } from "next/navigation";
import CoverageDetail from "@/components/CoverageDetail";

export default function CoveragePage() {
  const params = useParams<{ id: string }>();
  return <CoverageDetail coverageId={decodeURIComponent(params.id)} />;
}
