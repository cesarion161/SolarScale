/**
 * Central simulation clock.
 *
 * Owns simulated time (seconds since J2000), the time-scale multiplier and
 * the paused flag. Everything time-dependent — orbital motion, spin, light
 * propagation — derives from this single source of truth.
 */

export const J2000_UNIX_MS = Date.UTC(2000, 0, 1, 12, 0, 0)

export class SimulationClock {
  /** Simulated seconds since the J2000 epoch. */
  private simTimeSec: number
  private scale = 1
  private paused = false

  constructor(startAtSimSec?: number) {
    // Default: start "now", so the configuration resembles the real sky
    // even though the MVP uses simplified Keplerian elements.
    this.simTimeSec = startAtSimSec ?? (Date.now() - J2000_UNIX_MS) / 1000
  }

  /** Advance by a real-time frame delta (seconds). */
  tick(realDtSec: number): void {
    if (this.paused) return
    // Clamp huge deltas (tab was backgrounded) to keep motion predictable.
    const dt = Math.min(realDtSec, 0.25)
    this.simTimeSec += dt * this.scale
  }

  get timeSec(): number {
    return this.simTimeSec
  }

  set timeSec(value: number) {
    this.simTimeSec = value
  }

  get timeScale(): number {
    return this.scale
  }

  set timeScale(value: number) {
    this.scale = value
  }

  get isPaused(): boolean {
    return this.paused
  }

  set isPaused(value: boolean) {
    this.paused = value
  }

  /** Simulated calendar date (approximate — ignores leap seconds). */
  toDate(): Date {
    return new Date(J2000_UNIX_MS + this.simTimeSec * 1000)
  }
}
