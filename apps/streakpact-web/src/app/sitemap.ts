import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = "https://streakpact-zeta.vercel.app";
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/pacts`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/pacts/new`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/join`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/how-it-works`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/admin`, changeFrequency: "weekly", priority: 0.6 },
  ];
}
