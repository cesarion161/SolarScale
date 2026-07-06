/**
 * Shared data types for the SolarScale runtime.
 *
 * Conventions (enforced by the offline preprocessing pipeline in /tools):
 *  - lengths in kilometres
 *  - times in seconds (negative rotation/orbit period = retrograde)
 *  - angles in radians
 *  - epoch is J2000 (2000-01-01T12:00:00Z); mean anomalies are given at epoch
 *  - the ecliptic plane is the reference plane
 */

export type BodyCategory =
  | 'star'
  | 'planet'
  | 'dwarfPlanet'
  | 'moon'
  | 'asteroid'
  | 'comet'

/** Classical Keplerian orbital elements, heliocentric or planetocentric. */
export interface OrbitalElements {
  /** Semi-major axis, km. */
  semiMajorAxisKm: number
  /** Eccentricity (0..1). */
  eccentricity: number
  /** Inclination to the reference plane, rad. */
  inclinationRad: number
  /** Longitude of the ascending node (Ω), rad. */
  ascendingNodeRad: number
  /** Argument of periapsis (ω), rad. */
  argPeriapsisRad: number
  /** Mean anomaly at epoch (M0), rad. */
  meanAnomalyAtEpochRad: number
  /** Orbital period, seconds. Negative = retrograde. */
  periodSec: number
}

export interface RotationInfo {
  /** Sidereal rotation period, seconds. Negative = retrograde spin. */
  periodSec: number
  /** Axial tilt (obliquity to orbit), rad. 0 when unknown. */
  axialTiltRad: number
}

export interface PhysicalInfo {
  /** Mean radius, km. */
  radiusKm: number
  /** Mass, kg (optional — unknown for many small bodies). */
  massKg?: number
}

/** Procedural texture archetype used by the material factory. */
export type SurfaceKind =
  | 'sun'
  | 'cratered'
  | 'venusian'
  | 'earthlike'
  | 'martian'
  | 'gasBands'
  | 'iceGiant'
  | 'icy'
  | 'rockyDark'

export interface BodyCommon {
  id: string
  name: string
  physical: PhysicalInfo
  /** Base albedo colour as CSS hex, used for tinting and label dots. */
  color: string
  surface: SurfaceKind
  description: string
  facts?: string[]
}

export interface PlanetData extends BodyCommon {
  category: 'star' | 'planet' | 'dwarfPlanet'
  /** Heliocentric orbit. Absent for the Sun. */
  orbit?: OrbitalElements
  rotation: RotationInfo
  /** Ring system (Saturn), radii relative to body radius. */
  rings?: { innerRadiusFactor: number; outerRadiusFactor: number }
}

export interface MoonData extends BodyCommon {
  category: 'moon'
  parentId: string
  /** Planetocentric orbit (reference plane ≈ parent equatorial plane). */
  orbit: OrbitalElements
  rotation: RotationInfo
}

export interface CometData extends BodyCommon {
  category: 'comet'
  orbit: OrbitalElements
}

export interface NamedAsteroidData extends BodyCommon {
  category: 'asteroid'
  orbit: OrbitalElements
}

export const ASTEROID_GROUPS = ['mainBelt', 'trojans', 'kuiperBelt'] as const
export type AsteroidGroup = (typeof ASTEROID_GROUPS)[number]

/**
 * Dense asteroid field decoded from `asteroids.v1.bin`.
 * Structure-of-record Float32 layout, stride = 8:
 *   [aKm, e, incl, node, argPeri, M0, radiusKm, groupIndex]
 */
export interface AsteroidFieldChunk {
  count: number
  stride: number
  records: Float32Array
  groupCounts: Record<AsteroidGroup, number>
}

export interface AsteroidLoadOptions {
  /** Restrict to specific groups; omit for all. */
  groups?: AsteroidGroup[]
  /** Cap the number of returned records (for low-end devices). */
  maxCount?: number
}

/** One precomputed orbit polyline (heliocentric ecliptic km, xyz triplets). */
export interface OrbitPathEntry {
  bodyId: string
  /** Flat xyz array in km, closed loop NOT duplicated (renderer closes it). */
  positionsKm: Float32Array
}

export interface OrbitPathChunk {
  entries: OrbitPathEntry[]
}

export interface OrbitPathOptions {
  /** Restrict to specific body ids; omit for all. */
  bodyIds?: string[]
}

export interface SolarSystemMeta {
  formatVersion: number
  generatedAt: string
  epoch: 'J2000'
  units: { length: 'km'; time: 's'; angle: 'rad' }
  counts: {
    planets: number
    dwarfPlanets: number
    moons: number
    comets: number
    namedAsteroids: number
    asteroidField: number
  }
  files: Record<string, string>
}
