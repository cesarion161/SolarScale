import type { RotationInfo } from '../data/types'

const TWO_PI = Math.PI * 2

/**
 * Spin angle (rad) around the body's own axis at simulation time.
 * A negative rotation period (Venus, Uranus, Pluto) yields retrograde spin.
 */
export function spinAngleAtTime(rotation: RotationInfo, timeSec: number): number {
  if (!rotation.periodSec) return 0
  return (TWO_PI * timeSec) / rotation.periodSec
}
