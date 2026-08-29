import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://streakpact-zeta.vercel.app", changeFrequency: "weekly", priority: 1 },
    { url: "https://streakpact-zeta.vercel.app/admin", changeFrequency: "weekly", priority: 0.6 },
  ];
}
