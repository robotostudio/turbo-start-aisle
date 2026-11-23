const hits = new Map<string, number[]>();

/** Keys kept at once, so a sweep of addresses can't grow the map forever. */
export const MAX_KEYS = 5000;

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
  // Re-added at the end, so the map runs from least to most recently seen.
  hits.delete(key);
  if (hits.size >= MAX_KEYS) {
    // Only the caller idle longest goes: emptying the map would hand every
    // caller a fresh allowance whenever someone sweeps through addresses.
    hits.delete(hits.keys().next().value as string);
  }
  hits.set(key, recent);
  return allowed;
}
