import { ImageResponse } from "next/og";

export const alt = "StreakPact by demigodd00 — accountability on GenLayer StudioNet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#101611",
        color: "#f4f7f1",
        padding: "76px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "22px", fontSize: 34 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 18, background: "#b9f14a", color: "#101611", fontWeight: 800 }}>S</div>
        <div style={{ display: "flex" }}>StreakPact <span style={{ color: "#8f9a90", marginLeft: 12 }}>by demigodd00</span></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 950 }}>
        <div style={{ color: "#b9f14a", fontSize: 24, letterSpacing: 5, textTransform: "uppercase" }}>GenLayer StudioNet</div>
        <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: -4, fontWeight: 750, marginTop: 24 }}>Put conviction behind your goals.</div>
        <div style={{ color: "#aeb7af", fontSize: 28, marginTop: 28 }}>Public evidence. Independent validator judgment. Time to appeal.</div>
      </div>
    </div>,
    size,
  );
}
