"use client";

import { useState } from "react";
import { friendlyError, hashEvidenceFile } from "@/lib/contract";
import { publishEvidence, type PublishedEvidence } from "@/lib/evidence";

export default function EvidenceFilePicker({
  idPrefix,
  onDigest,
  onPublished,
}: {
  idPrefix: string;
  onDigest: (digest: string) => void;
  onPublished: (evidence: PublishedEvidence) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [localDigest, setLocalDigest] = useState("");
  const [state, setState] = useState<"idle" | "hashing" | "ready" | "publishing" | "published">("idle");
  const [error, setError] = useState("");

  async function chooseFile(nextFile: File | undefined) {
    setError("");
    setLocalDigest("");
    setFile(nextFile ?? null);
    if (!nextFile) {
      setState("idle");
      return;
    }

    setState("hashing");
    try {
      const digest = await hashEvidenceFile(nextFile);
      setLocalDigest(digest);
      onDigest(digest);
      setState("ready");
    } catch (reason) {
      setFile(null);
      setState("idle");
      setError(friendlyError(reason));
    }
  }

  async function publish() {
    if (!file || !localDigest) return;
    setError("");
    setState("publishing");
    try {
      const result = await publishEvidence(file);
      if (result.digest.toLowerCase() !== localDigest.toLowerCase()) {
        throw new Error("The published bytes did not match the file you selected. Nothing was submitted onchain.");
      }
      onDigest(result.digest);
      onPublished(result);
      setState("published");
    } catch (reason) {
      setState("ready");
      setError(friendlyError(reason));
    }
  }

  const inputId = `${idPrefix}-evidence-file`;

  return (
    <div className="evidence-publisher">
      <label htmlFor={inputId}>
        <span>Choose the exact evidence file</span>
        <input
          id={inputId}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
        <small>JSON or plain text, maximum 100 KB. Published evidence is public and should contain no secrets.</small>
      </label>
      {file ? (
        <div className="evidence-file-summary">
          <div>
            <strong>{file.name}</strong>
            <small>{file.size.toLocaleString()} bytes</small>
          </div>
          <span className={`publish-state publish-${state}`}>
            {state === "hashing" ? "Hashing…" : state === "publishing" ? "Publishing…" : state === "published" ? "Published" : "Ready"}
          </span>
        </div>
      ) : null}
      {localDigest ? <code className="evidence-digest-preview">SHA-256 {localDigest}</code> : null}
      <button
        type="button"
        className="button button-secondary evidence-publish-button"
        disabled={!file || state === "hashing" || state === "publishing" || state === "published"}
        onClick={() => void publish()}
      >
        {state === "publishing" ? "Publishing exact bytes…" : state === "published" ? "Published to public IPFS" : "Publish and fill fields"}
      </button>
      {error ? <p className="form-error evidence-publish-error" role="alert">{error}</p> : null}
    </div>
  );
}
