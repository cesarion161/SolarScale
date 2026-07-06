import { LIGHT_SPEED_KM_S, AU_KM } from './scaleModes'

/**
 * Light-travel simulation: expanding spherical wavefronts emitted by the Sun.
 *
 * Pure simulation state — no rendering here. The renderer maps real-km radii
 * through the active scale mode, so a wavefront and a planet coincide on
 * screen exactly when light really reaches that planet.
 */

export interface LightPulse {
  /** Simulation time (sec since J2000) at which the pulse left the Sun. */
  emittedAtSimSec: number
}

/** Beyond this the pulse is culled (a bit past Pluto's aphelion, ~49 AU). */
const MAX_RADIUS_KM = 55 * AU_KM

export class LightTravelSimulation {
  private pulses: LightPulse[] = []
  private autoEmit = false
  private lastAutoEmitSimSec = -Infinity
  /**
   * Auto-emit spacing in simulated seconds. Two hours of light travel
   * (~14 AU) keeps successive wavefronts readable at system scale; pulses
   * are culled past Pluto before the six-slot pool needs to recycle.
   */
  autoEmitIntervalSimSec = 7200

  setAutoEmit(enabled: boolean, nowSimSec: number): void {
    this.autoEmit = enabled
    if (enabled && this.pulses.length === 0) {
      this.emit(nowSimSec)
    }
  }

  emit(nowSimSec: number): void {
    this.pulses.push({ emittedAtSimSec: nowSimSec })
    this.lastAutoEmitSimSec = nowSimSec
    if (this.pulses.length > 6) this.pulses.shift()
  }

  clear(): void {
    this.pulses = []
  }

  /** Advance bookkeeping; call once per frame with current sim time. */
  update(nowSimSec: number): void {
    this.pulses = this.pulses.filter((p) => {
      const ageSec = nowSimSec - p.emittedAtSimSec
      return ageSec >= 0 && ageSec * LIGHT_SPEED_KM_S <= MAX_RADIUS_KM
    })
    if (this.autoEmit && nowSimSec - this.lastAutoEmitSimSec >= this.autoEmitIntervalSimSec) {
      this.emit(nowSimSec)
    }
  }

  /** Current wavefront radii in real km (oldest first). */
  radiiKm(nowSimSec: number): number[] {
    return this.pulses.map((p) => (nowSimSec - p.emittedAtSimSec) * LIGHT_SPEED_KM_S)
  }

  /** Age of the most recent pulse, in simulated seconds (null if none). */
  newestPulseAgeSec(nowSimSec: number): number | null {
    const newest = this.pulses[this.pulses.length - 1]
    return newest ? nowSimSec - newest.emittedAtSimSec : null
  }
}

/** Light travel time from the Sun for a given distance. */
export function lightTravelTimeSec(distanceKm: number): number {
  return distanceKm / LIGHT_SPEED_KM_S
}

/** Format seconds as a compact "8 min 19 s" style string. */
export function formatDuration(totalSec: number): string {
  if (!isFinite(totalSec)) return '—'
  const sec = Math.floor(totalSec % 60)
  const min = Math.floor((totalSec / 60) % 60)
  const hr = Math.floor(totalSec / 3600)
  if (hr > 0) return `${hr} h ${min} min`
  if (min > 0) return `${min} min ${sec} s`
  return `${totalSec.toFixed(totalSec < 10 ? 1 : 0)} s`
}
