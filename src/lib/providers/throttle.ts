/**
 * Token-Bucket Throttle (z.B. EDGAR: 10 req/s).
 * Per-Host gehalten; serialisiert Requests auf konfigurierte Rate.
 */
class TokenBucket {
  private tokens: number;
  private last: number;
  private waiters: Array<() => void> = [];

  constructor(
    private capacity: number,
    /** Tokens pro Sekunde */
    private refillPerSec: number,
  ) {
    this.tokens = capacity;
    this.last = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const delta = (now - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + delta * this.refillPerSec);
    this.last = now;
  }

  async take(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      const tick = () => {
        this.refill();
        if (this.tokens >= 1 && this.waiters[0] === resolve) {
          this.tokens -= 1;
          this.waiters.shift();
          resolve();
          return;
        }
        setTimeout(tick, Math.max(50, 1000 / this.refillPerSec));
      };
      setTimeout(tick, Math.max(50, 1000 / this.refillPerSec));
    });
  }
}

const buckets = new Map<string, TokenBucket>();

/** Fetch-Wrapper mit per-Host Rate-Limit. */
export async function throttledFetch(
  url: string,
  init: RequestInit,
  opts: { ratePerSec: number; capacity?: number },
): Promise<Response> {
  const host = new URL(url).host;
  let bucket = buckets.get(host);
  if (!bucket) {
    bucket = new TokenBucket(opts.capacity ?? Math.max(opts.ratePerSec, 1), opts.ratePerSec);
    buckets.set(host, bucket);
  }
  await bucket.take();
  return fetch(url, init);
}
