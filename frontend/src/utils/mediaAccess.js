// One credential-isolated, bounded cache for this API's scoped media URLs.
export function createMediaAccess({ apiBase, origin, getToken, request, now = () => Date.now() }) {
  const api = new URL(apiBase.replace(/\/+$/, "") + "/", origin);
  const prefix = api.pathname + "media/";
  const loopback = host => host === "localhost" || host === "127.0.0.1";
  const cache = new Map();
  let sessionToken;
  let generation = 0;

  function syncSession() {
    const token = getToken() || "";
    if (token !== sessionToken) { cache.clear(); generation += 1; sessionToken = token; }
    return token;
  }

  function mediaURL(value) {
    if (!value || typeof value !== "string") return null;
    let parsed;
    try { parsed = new URL(value, origin); } catch { return null; }
    const localProxy = apiBase.startsWith("/") && loopback(api.hostname) && loopback(parsed.hostname) && parsed.port === "8000";
    if ((!localProxy && parsed.origin !== api.origin) || !parsed.pathname.startsWith(prefix)
        || !/^[0-9a-f-]{36}$/i.test(parsed.pathname.slice(prefix.length))) return null;
    // Development backend URLs also travel through the configured Vite API proxy.
    parsed.protocol = api.protocol;
    parsed.host = api.host;
    parsed.hash = "";
    return parsed;
  }

  async function resolve(value, { force = false } = {}) {
    const token = syncSession();
    const source = mediaURL(value);
    if (!source) return value;
    source.searchParams.delete("ticket");
    const invitation = source.searchParams.get("invite");
    const hasInvitation = typeof invitation === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(invitation);
    if (!token) {
      if (!hasInvitation) throw new Error("An invitation is required to view album media");
      return source.href;
    }
    const key = source.href;
    const existing = cache.get(key);
    if (!force && existing?.url && existing.expiresAt > now() + 30_000) return existing.url;
    if (!force && existing?.promise) return existing.promise;
    const epoch = generation;
    const entry = {};
    const endpoint = new URL(source.href);
    endpoint.pathname += "/access";
    entry.promise = (async () => {
      const reply = await request(endpoint.href, token);
      if (epoch !== generation || token !== (getToken() || "")) throw new Error("Media session changed");
      const result = mediaURL(reply?.url);
      const expiresAt = reply?.expires_at === null ? Infinity : Number(reply?.expires_at) * 1000;
      if (!result || result.pathname !== source.pathname
          || (result.searchParams.get("variant") || "display") !== (source.searchParams.get("variant") || "display")
          || !(expiresAt > now()) || (Number.isFinite(expiresAt) && !result.searchParams.get("ticket"))
          || (!Number.isFinite(expiresAt) && (!hasInvitation || result.searchParams.get("invite") !== invitation))
          || (!Number.isFinite(expiresAt) && result.searchParams.has("ticket"))) throw new Error("Invalid media response");
      if (cache.get(key) === entry) cache.set(key, { url: result.href, expiresAt });
      return result.href;
    })();
    cache.set(key, entry);
    if (cache.size > 256) cache.delete(cache.keys().next().value);
    try { return await entry.promise; }
    catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
  }
  return { resolve, syncSession };
}
