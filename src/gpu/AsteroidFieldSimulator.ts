import type { AsteroidFieldChunk } from '../data/types'

/**
 * Boundary for the compute-heavy asteroid-field propagation.
 *
 * The MVP ships a TypeScript implementation (CpuAsteroidFieldSimulator).
 * Because the renderer only consumes this interface — orbital elements in,
 * packed positions out — a WGSL compute-shader implementation can replace it
 * later (writing straight into a GPU storage buffer) without touching the
 * renderer, data or UI layers. See src/gpu/README.md.
 */
export interface AsteroidFieldSimulator {
  /** Upload/replace the field's orbital elements. */
  setField(chunk: AsteroidFieldChunk): void
  /** Number of simulated asteroids. */
  readonly count: number
  /**
   * Propagate all asteroids to `simTimeSec` and return heliocentric
   * positions in km (xyz triplets, three.js frame). The returned buffer is
   * owned by the simulator and reused between calls.
   */
  computePositionsKm(simTimeSec: number): Float32Array
  dispose(): void
}
