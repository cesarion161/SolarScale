import type { BodyCategory } from '../data/types'

/**
 * Scale modes — the educational core of the app.
 *
 * Scene unit: 1 unit = 1,000,000 km (1 Gm). At true scale 1 AU ≈ 149.6 units.
 *
 * Every mode is a pure, radially-monotonic mapping from real kilometres to
 * scene units. Radial monotonicity keeps orbits, positions and the light
 * wavefront mutually consistent in every mode: a body and the light front are
 * displayed at the same place exactly when they are at the same real distance.
 */

export const KM_PER_UNIT = 1_000_000
export const AU_KM = 149_597_870.7
export const LIGHT_SPEED_KM_S = 299_792.458

export type ScaleModeId = 'true' | 'exaggerated' | 'compressed' | 'comparison'

export interface ScaleMode {
  id: ScaleModeId
  label: string
  tagline: string
  /** Educational annotation: what is accurate and what is exaggerated. */
  accuracyNote: string
  /**
   * True when heliocentric distances map linearly to km, i.e. an on-screen
   * ruler is honest. Drives the UI's km-per-pixel scale bar.
   */
  distancesReal: boolean
  /**
   * True when body sizes are unexaggerated. When set, the renderer draws
   * bodies at their genuine projected size only — no presence dots, no
   * minimum screen-size floor. Sub-pixel bodies simply vanish (labels still
   * mark their positions); that emptiness is the whole lesson of true scale.
   */
  sizesReal: boolean
  /** Display radius of a body, scene units. */
  bodyRadius(radiusKm: number, category: BodyCategory): number
  /** Heliocentric distance transform, km → scene units. Monotonic in r. */
  helioDistance(km: number): number
  /**
   * Orbit radius of a moon around its parent, scene units.
   * Needs the parent's real radius and current display radius because
   * exaggerated planets would otherwise swallow their moons.
   */
  moonOrbitRadius(km: number, parentRadiusKm: number, parentDisplayRadius: number): number
}

function trueRadius(radiusKm: number): number {
  return radiusKm / KM_PER_UNIT
}

/**
 * Moon-orbit compression shared by the exaggerated-style modes: preserve the
 * ordering and rough proportions of a moon system while keeping every moon
 * outside its (inflated) parent. `ratio` is the real distance/parent-radius
 * ratio (Moon≈60, Io≈6), compressed with a square root.
 */
function compressedMoonOrbit(
  km: number,
  parentRadiusKm: number,
  parentDisplayRadius: number,
): number {
  const ratio = km / parentRadiusKm
  return parentDisplayRadius * Math.max(1.6, 0.8 * Math.sqrt(ratio))
}

const trueScale: ScaleMode = {
  id: 'true',
  label: 'True scale',
  tagline: 'Real sizes. Real distances. Real emptiness.',
  accuracyNote:
    'Everything here is to scale: body sizes and distances share one ruler ' +
    '(1 px can span millions of km). Planets are nearly invisible dots — ' +
    'that is the point. The Solar System is almost entirely empty space.',
  distancesReal: true,
  sizesReal: true,
  bodyRadius: (r) => trueRadius(r),
  helioDistance: (km) => km / KM_PER_UNIT,
  moonOrbitRadius: (km) => km / KM_PER_UNIT,
}

const exaggerated: ScaleMode = {
  id: 'exaggerated',
  label: 'Big bodies',
  tagline: 'Distances stay real, bodies inflated so you can see them.',
  accuracyNote:
    'Orbital distances are accurate. Body sizes are NOT: planets and moons ' +
    'are drawn ~400× too large (the Sun ~25×) so they are visible from ' +
    'system-wide views. Moon orbits are compressed to keep moons outside ' +
    'their inflated parents.',
  distancesReal: true,
  sizesReal: false,
  bodyRadius: (r, category) => {
    switch (category) {
      case 'star':
        return trueRadius(r) * 25
      case 'asteroid':
      case 'comet':
        return trueRadius(r) * 2000
      default:
        return trueRadius(r) * 400
    }
  },
  helioDistance: (km) => km / KM_PER_UNIT,
  moonOrbitRadius: compressedMoonOrbit,
}

/** Square-root radial compression: Neptune lands ~600 units from the Sun. */
const COMPRESSED_C = 110
const compressed: ScaleMode = {
  id: 'compressed',
  label: 'Compressed distances',
  tagline: 'Distances squashed (√r) so the outer system fits on screen.',
  accuracyNote:
    'Distances are compressed with a square-root law: the outer Solar ' +
    'System is pulled dramatically inward (Neptune looks ~5× closer than ' +
    'Mercury instead of ~78×). Relative planet sizes are true to each ' +
    'other but inflated ~100× (Sun ~10×). Do not read distances literally.',
  distancesReal: false,
  sizesReal: false,
  bodyRadius: (r, category) => (category === 'star' ? trueRadius(r) * 10 : trueRadius(r) * 100),
  helioDistance: (km) => COMPRESSED_C * Math.sqrt(Math.max(0, km) / AU_KM),
  moonOrbitRadius: compressedMoonOrbit,
}

/** Stronger compression + bigger bodies: the friendly "orrery" view. */
const COMPARISON_C = 130
const comparison: ScaleMode = {
  id: 'comparison',
  label: 'Comparison view',
  tagline: 'A classroom orrery: everything visible at once.',
  accuracyNote:
    'This is the classic textbook picture — and the least accurate one. ' +
    'Distances follow a strong power-law compression and bodies are drawn ' +
    '~450× too large (Sun ~20×). Relative planet sizes are correct; ' +
    'distances and Sun/planet proportion are intentionally wrong. Switch ' +
    'to True scale to see reality.',
  distancesReal: false,
  sizesReal: false,
  bodyRadius: (r, category) => {
    switch (category) {
      case 'star':
        return trueRadius(r) * 20
      case 'asteroid':
      case 'comet':
        return trueRadius(r) * 2500
      default:
        return trueRadius(r) * 450
    }
  },
  helioDistance: (km) => COMPARISON_C * Math.pow(Math.max(0, km) / AU_KM, 0.4),
  moonOrbitRadius: compressedMoonOrbit,
}

export const SCALE_MODES: Record<ScaleModeId, ScaleMode> = {
  true: trueScale,
  exaggerated,
  compressed,
  comparison,
}

export const SCALE_MODE_LIST: ScaleMode[] = [trueScale, exaggerated, compressed, comparison]
