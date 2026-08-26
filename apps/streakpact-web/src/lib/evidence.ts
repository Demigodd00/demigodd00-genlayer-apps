export interface PublishedEvidence {
  cid: string;
  digest: string;
  size: number;
  url: string;
}

interface EvidenceApiResponse extends Partial<PublishedEvidence> {
  error?: string;
}

export async function publishEvidence(file: File): Promise<PublishedEvidence> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch("/api/evidence", {
    method: "POST",
    body,
    cache: "no-store",
  });

  let payload: EvidenceApiResponse = {};
  try {
    payload = (await response.json()) as EvidenceApiResponse;
  } catch {
    // Keep the user-facing error stable when an upstream proxy returns HTML.
  }

  if (!response.ok) {
    throw new Error(payload.error || "Evidence publishing is temporarily unavailable.");
  }

  if (
    typeof payload.cid !== "string"
    || typeof payload.digest !== "string"
    || typeof payload.size !== "number"
    || typeof payload.url !== "string"
  ) {
    throw new Error("The evidence service returned an incomplete response.");
  }

  return {
    cid: payload.cid,
    digest: payload.digest,
    size: payload.size,
    url: payload.url,
  };
}
