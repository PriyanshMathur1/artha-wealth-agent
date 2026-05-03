/**
 * Multi-source data manager with explicit failover and freshness tracking.
 *
 * Background
 * ----------
 * Today the agents call `getQuote`, `getCurrentNav`, etc. directly. That
 * works but has two problems:
 *   1. No explicit fallback policy — Angel One failure means the call throws
 *      and the agent silently falls back to cost basis.
 *   2. No freshness signal — a 30-min-old cached quote is rendered the same
 *      as a live one.
 *
 * This module wraps any number of sources with:
 *   - Priority order
 *   - Cooldown after failure (don't hammer a 5xx provider)
 *   - 60-second cache of successful results
 *   - Per-call freshness metadata (`fetchedAt`, `stale`, `source`)
 *
 * Group 3 of RALPH_TASK.md fills in the per-source registries on top of
 * this scaffold. See `lib/data/quotes.ts` and `lib/data/mfnav.ts`.
 */

/** A single data source. Implementations can wrap Angel One, Yahoo, MFAPI, etc. */
export interface DataSource<T> {
  /** Stable identifier used in cooldown tracking + freshness metadata. */
  name: string;
  /** Lower number = tried first. */
  priority: number;
  /** The actual fetch. Throws on failure. May throw `NoTokenError` to
   *  indicate "skip this source for THIS call only" without triggering
   *  cooldown — see `isPerCallSkip` below. */
  fetch: (key: string) => Promise<T>;
  /** Optional cheap pre-check. Returning false skips the source without
   *  counting against cooldown. */
  isHealthy?: () => Promise<boolean> | boolean;
}

/** Throw this from a source's `fetch` to mean "this source isn't usable for
 *  THIS call (e.g. user has no broker token), but the source itself is fine".
 *  The dispatcher will skip without putting the source in cooldown. */
export class NoTokenError extends Error {
  constructor(sourceName: string) {
    super(`${sourceName}: per-user authentication required`);
    this.name = 'NoTokenError';
  }
}

/** Result of `withFallback`. Always includes provenance metadata. */
export interface FetchResult<T> {
  value: T;
  source: string;
  /** ISO timestamp when this value was fetched (or last refreshed). */
  fetchedAt: string;
  /** True when the value came from the in-memory cache and is older than
   *  the per-call freshness budget. Agents use this to add a freshness
   *  bullet to their evidence. */
  stale: boolean;
}

interface CacheEntry<T> {
  value: T;
  source: string;
  fetchedAt: number; // ms epoch
}

interface CooldownEntry {
  until: number; // ms epoch
  failures: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const cooldown = new Map<string, CooldownEntry>();

const CACHE_TTL_MS = 60_000;
const COOLDOWN_BASE_MS = 30_000; // 30s on first failure
const COOLDOWN_MAX_MS = 5 * 60_000; // cap at 5 minutes
const STALE_AFTER_MS = 5 * 60_000; // result older than this → stale: true

/**
 * Try sources in priority order. Returns the first success.
 *
 * Cache key combines `cacheNamespace` and `key` so different aggregators
 * (quotes vs MF NAVs) don't collide.
 *
 * @example
 *   const result = await withFallback({
 *     cacheNamespace: 'quote',
 *     key: 'RELIANCE',
 *     sources: [angelOneQuoteSource, yahooQuoteSource],
 *   });
 */
export async function withFallback<T>(opts: {
  cacheNamespace: string;
  key: string;
  sources: DataSource<T>[];
  /** Override the default 60s cache TTL. */
  cacheTtlMs?: number;
  /** Override the staleness threshold. Stocks during market hours might
   *  want 60s; MFs (NAVs publish daily) might want 24 hours. */
  staleAfterMs?: number;
}): Promise<FetchResult<T>> {
  const ttl = opts.cacheTtlMs ?? CACHE_TTL_MS;
  const staleAfter = opts.staleAfterMs ?? STALE_AFTER_MS;
  const cacheKey = `${opts.cacheNamespace}:${opts.key}`;

  // 1. Cache hit.
  const cached = cache.get(cacheKey) as CacheEntry<T> | undefined;
  const now = Date.now();
  if (cached && now - cached.fetchedAt < ttl) {
    return {
      value: cached.value,
      source: cached.source,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      stale: now - cached.fetchedAt > staleAfter,
    };
  }

  // 2. Try sources in priority order.
  const ordered = [...opts.sources].sort((a, b) => a.priority - b.priority);
  const failures: string[] = [];

  for (const source of ordered) {
    if (isInCooldown(source.name, now)) {
      failures.push(`${source.name}: cooldown`);
      continue;
    }
    if (source.isHealthy) {
      try {
        const ok = await source.isHealthy();
        if (!ok) {
          failures.push(`${source.name}: unhealthy`);
          continue;
        }
      } catch {
        failures.push(`${source.name}: healthcheck threw`);
        continue;
      }
    }
    try {
      const value = await source.fetch(opts.key);
      cache.set(cacheKey, { value, source: source.name, fetchedAt: now });
      cooldown.delete(source.name); // clear any prior cooldown on success
      return {
        value,
        source: source.name,
        fetchedAt: new Date(now).toISOString(),
        stale: false,
      };
    } catch (err) {
      if (err instanceof NoTokenError) {
        // Per-user issue — don't put the source in cooldown.
        failures.push(`${source.name}: no token`);
        continue;
      }
      registerFailure(source.name, now);
      failures.push(`${source.name}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  // 3. Last resort: stale cache, regardless of TTL.
  if (cached) {
    return {
      value: cached.value,
      source: cached.source,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      stale: true,
    };
  }

  throw new Error(`All sources failed for ${cacheKey}: ${failures.join('; ')}`);
}

function isInCooldown(name: string, now: number): boolean {
  const entry = cooldown.get(name);
  if (!entry) return false;
  if (entry.until <= now) {
    cooldown.delete(name);
    return false;
  }
  return true;
}

function registerFailure(name: string, now: number): void {
  const prior = cooldown.get(name);
  const failures = (prior?.failures ?? 0) + 1;
  // Exponential backoff: 30s, 1m, 2m, 4m, capped at 5m.
  const delay = Math.min(COOLDOWN_BASE_MS * 2 ** (failures - 1), COOLDOWN_MAX_MS);
  cooldown.set(name, { until: now + delay, failures });
}

// ── Test helpers ────────────────────────────────────────────────────────

/** Reset internal state. Used by `evals/run.ts` between fixtures so a
 *  failed quote in fixture N doesn't leak into fixture N+1. */
export function _resetForTests(): void {
  cache.clear();
  cooldown.clear();
}

/** Snapshot of internal state for debug/observability endpoints. */
export function dataSourceStats(): {
  cacheSize: number;
  cooldownEntries: Array<{ name: string; secondsRemaining: number; failures: number }>;
} {
  const now = Date.now();
  return {
    cacheSize: cache.size,
    cooldownEntries: Array.from(cooldown.entries()).map(([name, entry]) => ({
      name,
      secondsRemaining: Math.max(0, Math.round((entry.until - now) / 1000)),
      failures: entry.failures,
    })),
  };
}
