import { notFound } from "next/navigation";
import { validRoute } from "@/lib/protocol";
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  if (!validRoute(path)) notFound();
  return null;
}
