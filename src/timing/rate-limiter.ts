/**
 * Rate limiter utility for controlling request frequency and concurrency.
 */

import Bottleneck from "bottleneck"

/**
 * Construction options for `RateLimiter`.
 */
export interface RateLimiterOptions {
  /** Minimum gap enforced between successive scheduled operations, in milliseconds. Defaults to `0`. */
  minIntervalMs?: number
  /** Maximum number of operations allowed to run concurrently. Defaults to `1`. */
  maxConcurrent?: number
}

/**
 * Enforces a minimum interval and/or a concurrency cap on scheduled operations, backed by Bottleneck.
 */
export class RateLimiter {
  /** Underlying Bottleneck limiter configured with `minTime` and `maxConcurrent`. */
  private readonly limiter: Bottleneck

  /**
   * Create a limiter configured with the given minimum interval and concurrency cap.
   *
   * @param options - Limiter configuration. `minIntervalMs` defaults to `0` and `maxConcurrent` defaults to `1`.
   */
  public constructor(options: RateLimiterOptions) {
    this.limiter = new Bottleneck({
      minTime: options.minIntervalMs ?? 0,
      maxConcurrent: options.maxConcurrent ?? 1,
    })
  }

  /**
   * Await the remainder of the configured interval before the caller issues its next request.
   * A placeholder task is scheduled purely to consume an interval slot, so the gap is enforced
   * between successive `wait()` resolutions (request *initiations*), not between the completion
   * of one request and the start of the next. Concurrent callers are serialised by Bottleneck.
   *
   * @returns A promise that resolves once the caller is cleared to proceed.
   */
  public async wait(): Promise<void> {
    await this.limiter.schedule(async () => {
      /* placeholder task: scheduling it consumes one interval slot */
    })
  }

  /**
   * Schedule an async task through the limiter, honouring both the minimum-interval and concurrency caps.
   * The returned promise settles with the task's result (or rejection), unchanged.
   *
   * @param task - Async task to execute once the limiter admits it.
   * @returns The task's resolved value.
   */
  public async schedule<T>(task: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(task)
  }
}
