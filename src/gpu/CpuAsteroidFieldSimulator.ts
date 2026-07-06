import type { AsteroidFieldChunk } from '../data/types'
import type { AsteroidFieldSimulator } from './AsteroidFieldSimulator'
import { solveEccentricAnomaly, rotateToReferenceFrame } from '../simulation/orbitalMotion'

const TWO_PI = Math.PI * 2
const YEAR_SEC = 365.25 * 86_400
const AU_KM = 149_597_870.7

/**
 * TypeScript reference implementation of the asteroid-field propagator.
 *
 * Kepler-solves every asteroid per call (a few thousand Newton iterations —
 * well under a millisecond for the MVP field). Periods are derived from the
 * semi-major axis via Kepler's third law, so the binary asset only stores
 * six elements + radius + group per record.
 */
export class CpuAsteroidFieldSimulator implements AsteroidFieldSimulator {
  private records: Float32Array = new Float32Array(0)
  private stride = 8
  private n = 0
  private positions = new Float32Array(0)
  /** Precomputed mean motion (rad/sec) per asteroid. */
  private meanMotion = new Float64Array(0)
  private tmp = { x: 0, y: 0, z: 0 }

  setField(chunk: AsteroidFieldChunk): void {
    this.records = chunk.records
    this.stride = chunk.stride
    this.n = chunk.count
    this.positions = new Float32Array(this.n * 3)
    this.meanMotion = new Float64Array(this.n)
    for (let i = 0; i < this.n; i++) {
      const aKm = this.records[i * this.stride]
      const periodSec = YEAR_SEC * Math.pow(aKm / AU_KM, 1.5)
      this.meanMotion[i] = TWO_PI / periodSec
    }
  }

  get count(): number {
    return this.n
  }

  computePositionsKm(simTimeSec: number): Float32Array {
    const { records, stride, positions, tmp } = this
    const orbitFrame = { inclinationRad: 0, ascendingNodeRad: 0, argPeriapsisRad: 0 }
    for (let i = 0; i < this.n; i++) {
      const base = i * stride
      const a = records[base]
      const e = records[base + 1]
      orbitFrame.inclinationRad = records[base + 2]
      orbitFrame.ascendingNodeRad = records[base + 3]
      orbitFrame.argPeriapsisRad = records[base + 4]
      const M = records[base + 5] + this.meanMotion[i] * simTimeSec
      const E = solveEccentricAnomaly(M, e)
      const xOrb = a * (Math.cos(E) - e)
      const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E)
      rotateToReferenceFrame(orbitFrame, xOrb, yOrb, tmp)
      positions[i * 3] = tmp.x
      positions[i * 3 + 1] = tmp.y
      positions[i * 3 + 2] = tmp.z
    }
    return positions
  }

  dispose(): void {
    this.records = new Float32Array(0)
    this.positions = new Float32Array(0)
    this.meanMotion = new Float64Array(0)
    this.n = 0
  }
}
