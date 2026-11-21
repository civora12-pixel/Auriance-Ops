/** Fixed-window, in-memory counter. Fine for a single server process. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** True while the key is still under the limit (does not count a hit). */
  check(key: string): boolean {
    const entry = this.hits.get(key);
    return !entry || entry.resetAt < Date.now() || entry.count < this.limit;
  }

  /** Counts a hit; returns false once the key is over the limit. */
  hit(key: string): boolean {
    const now = Date.now();
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count++;
    if (this.hits.size > 10_000) this.sweep(now);
    return entry.count <= this.limit;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt < now) this.hits.delete(key);
  }
}
