"use client";

import { useRef, useState } from "react";
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
  const selection = useRef(0);

  async function chooseFile(nextFile: File | undefined) {
    const selectionId = ++selection.current;
    setError("");
    setLocalDigest("");
    onDigest("");
    setFile(nextFile ?? null);
    if (!nextFile) {
      setState("idle");
      return;
    }

    setState("hashing");
    try {
      const digest = await hashEvidenceFile(nextFile);
      if (selection.current !== selectionId) return;
      setLocalDigest(digest);
      onDigest(digest);
      setState("ready");
    } catch (reason) {
      if (selection.current !== selectionId) return;
      setFile(null);
      setState("idle");
      setError(friendlyError(reason));
    }
  }

  async function publish() {
    if (!file || !localDigest) return;
    const selectionId = selection.current;
    setError("");
    setState("publishing");
    try {
      const result = await publishEvidence(file);
      if (selection.current !== selectionId) return;
      if (result.digest.toLowerCase() !== localDigest.toLowerCase()) {
        throw new Error("File verification failed. Nothing was submitted onchain.");
      }
      onDigest(result.digest);
      onPublished(result);
      setState("published");
    } catch (reason) {
      if (selection.current !== selectionId) return;
      setState("ready");
      setError(friendlyError(reason));
    }
  }

  const inputId = `${idPrefix}-evidence-file`;

  return (
    <div className="evidence-publisher">
      <label htmlFor={inputId}>
        <span>Evidence file</span>
        <input
          id={inputId}
          type="file"
          disabled={state === "hashing" || state === "publishing"}
          accept=".json,.txt,application/json,text/plain"
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
        <small>JSON or text · 100 KB max. Evidence is public—don’t upload private information.</small>
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
      {localDigest ? (
        <details className="evidence-details">
          <summary>File fingerprint</summary>
          <code className="evidence-digest-preview">SHA-256 {localDigest}</code>
        </details>
      ) : null}
      <button
        type="button"
        className="button button-secondary evidence-publish-button"
        disabled={!file || state === "hashing" || state === "publishing" || state === "published"}
        onClick={() => void publish()}
      >
        {state === "publishing" ? "Publishing…" : state === "published" ? "Published" : "Publish evidence"}
      </button>
      {error ? <p className="form-error evidence-publish-error" role="alert">{error}</p> : null}
    </div>
  );
}
