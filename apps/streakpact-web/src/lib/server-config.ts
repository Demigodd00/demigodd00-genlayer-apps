/** Return an exact origin, never a URL containing credentials, paths or queries. */
export function configuredAppOrigin(): string | null {
  const value = process.env.STREAKPACT_APP_ORIGIN?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const localHttp = process.env.NODE_ENV !== "production"
      && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function contractAddressConfigured(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/i.test(address);
}
