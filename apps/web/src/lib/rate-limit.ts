const hits = new Map<string, number[]>();

/** Keys kept before the map is emptied, so an address sweep can't grow it forever. */
const MAX_KEYS = 5000;

/**
 * True while `key` has made fewer than `limit` calls in the last `windowMs`.
 *
 * shortcut: counted in memory per server instance, so the real ceiling is
 * `limit` times the instances running. Move to a shared store or a Vercel
 * Firewall rule when /mcp gets real traffic.
 */
export function allowRequest(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  const allowed = recent.length < limit;
  if (allowed) {
    recent.push(now);
  }
  if (hits.size >= MAX_KEYS && !hits.has(key)) {
    hits.clear();
  }
  hits.set(key, recent);
  return allowed;
}
