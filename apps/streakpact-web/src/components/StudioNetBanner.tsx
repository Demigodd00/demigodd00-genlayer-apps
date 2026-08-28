"use client";

import { useEffect, useState } from "react";
import {
  CONTRACT_READY,
  NETWORK_NAME,
  formatDuration,
  getAdminData,
} from "@/lib/contract";

export default function StudioNetBanner() {
  const [timing, setTiming] = useState("");

  useEffect(() => {
    if (!CONTRACT_READY) return;
    getAdminData()
      .then(({ config }) => {
        setTiming(
          `${formatDuration(config.period_secs)} periods · ${formatDuration(config.appeal_window_secs)} appeals`,
        );
      })
      .catch(() => setTiming("Timing unavailable"));
  }, []);

  return (
    <div className="studionet-banner" role="note">
      <span className="network-dot" aria-hidden="true" />
      <strong>{NETWORK_NAME} demo</strong>
      <span>Test GEN has no monetary value</span>
      <span>{CONTRACT_READY ? timing || "Loading timing…" : "Contract setup pending"}</span>
    </div>
  );
}
