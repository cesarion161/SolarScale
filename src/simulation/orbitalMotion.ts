import type { OrbitalElements } from '../data/types'

/**
 * Keplerian two-body orbital motion.
 *
 * This is the MVP's simplified model: fixed classical elements propagated
 * with the Kepler equation. The educational goals (scale, motion, light
 * travel) do not require ephemeris precision, but the module is deliberately
 * self-contained so a sampled-trajectory or VSOP-style model can replace it
 * behind the same `positionAtTime` signature later.
 */

const TWO_PI = Math.PI * 2

/** Solve Kepler's equation M = E - e·sin(E) for E (rad). */
export function solveEccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
  const M = ((meanAnomaly % TWO_PI) + TWO_PI) % TWO_PI
  // Newton–Raphson with a starting guess robust for high eccentricity.
  let E = eccentricity > 0.8 ? Math.PI : M
  for (let i = 0; i < 10; i++) {
    const f = E - eccentricity * Math.sin(E) - M
    const fPrime = 1 - eccentricity * Math.cos(E)
    const dE = f / fPrime
    E -= dE
    if (Math.abs(dE) < 1e-9) break
  }
  return E
}

/**
 * Heliocentric/planetocentric position at simulation time, in km, in the
 * orbit's reference frame. Axes follow the three.js convention used across
 * the app: reference plane = XZ, +Y = north pole of the reference plane.
 */
export function positionAtTime(
  orbit: OrbitalElements,
  timeSec: number,
  out: { x: number; y: number; z: number },
): void {
  const period = orbit.periodSec
  const meanMotion = TWO_PI / period // sign of period encodes retrograde motion
  const M = orbit.meanAnomalyAtEpochRad + meanMotion * timeSec
  const e = orbit.eccentricity
  const E = solveEccentricAnomaly(M, e)

  // Position in the orbital plane (periapsis along +X of that plane).
  const a = orbit.semiMajorAxisKm
  const xOrb = a * (Math.cos(E) - e)
  const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E)

  rotateToReferenceFrame(orbit, xOrb, yOrb, out)
}

/** Rotate in-plane coordinates (periapsis frame) into the reference frame. */
export function rotateToReferenceFrame(
  orbit: Pick<OrbitalElements, 'inclinationRad' | 'ascendingNodeRad' | 'argPeriapsisRad'>,
  xOrb: number,
  yOrb: number,
  out: { x: number; y: number; z: number },
): void {
  const cosW = Math.cos(orbit.argPeriapsisRad)
  const sinW = Math.sin(orbit.argPeriapsisRad)
  const cosI = Math.cos(orbit.inclinationRad)
  const sinI = Math.sin(orbit.inclinationRad)
  const cosO = Math.cos(orbit.ascendingNodeRad)
  const sinO = Math.sin(orbit.ascendingNodeRad)

  // Classic 3-1-3 rotation (ω, i, Ω) in ecliptic coordinates (X, Y in plane,
  // Z north), then remapped to the three.js frame: x→x, y→z (north), z→-y…
  // Concretely we map ecliptic (X, Y, Z) → three.js (X, Z_up=Y? ) as:
  //   three.x = ecl.x, three.y = ecl.z, three.z = -ecl.y
  const xw = cosW * xOrb - sinW * yOrb
  const yw = sinW * xOrb + cosW * yOrb

  const eclX = cosO * xw - sinO * (yw * cosI)
  const eclY = sinO * xw + cosO * (yw * cosI)
  const eclZ = yw * sinI

  out.x = eclX
  out.y = eclZ
  out.z = -eclY
}

/**
 * Sample one full orbit as a closed polyline (km, three.js frame).
 * Sampling is uniform in eccentric anomaly, which naturally concentrates
 * points near periapsis where curvature is highest — important for comets.
 */
export function sampleOrbitPath(orbit: OrbitalElements, segments: number): Float32Array {
  const out = new Float32Array(segments * 3)
  const e = orbit.eccentricity
  const a = orbit.semiMajorAxisKm
  const b = a * Math.sqrt(1 - e * e)
  const p = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < segments; i++) {
    const E = (i / segments) * TWO_PI
    const xOrb = a * (Math.cos(E) - e)
    const yOrb = b * Math.sin(E)
    rotateToReferenceFrame(orbit, xOrb, yOrb, p)
    out[i * 3] = p.x
    out[i * 3 + 1] = p.y
    out[i * 3 + 2] = p.z
  }
  return out
}
