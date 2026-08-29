import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StreakPact by demigodd00",
    short_name: "StreakPact",
    description: "Evidence-backed accountability on GenLayer StudioNet.",
    start_url: "/",
    display: "standalone",
    background_color: "#101611",
    theme_color: "#101611",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
