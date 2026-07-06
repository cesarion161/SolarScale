import { Vector3 } from 'three/webgpu'
import type {
  BodyCategory,
  CometData,
  MoonData,
  NamedAsteroidData,
  OrbitalElements,
  PhysicalInfo,
  PlanetData,
  RotationInfo,
  SurfaceKind,
} from '../data/types'
import { positionAtTime } from '../simulation/orbitalMotion'
import type { ScaleMode } from '../simulation/scaleModes'

/**
 * Runtime body registry: one flat, parent-before-child ordered list of every
 * individually simulated object (the dense asteroid field lives elsewhere).
 *
 * Real positions are kept in plain JS doubles (km). Display positions are
 * heliocentric scene units under the active scale mode; the engine applies
 * the floating-origin subtraction in double precision before anything is
 * handed to the GPU, so close-up views stay jitter-free at any distance.
 */

export interface RuntimeBody {
  id: string
  name: string
  category: BodyCategory
  physical: PhysicalInfo
  color: string
  surface: SurfaceKind
  orbit?: OrbitalElements
  rotation?: RotationInfo
  parent?: RuntimeBody
  rings?: { innerRadiusFactor: number; outerRadiusFactor: number }
  source: PlanetData | MoonData | CometData | NamedAsteroidData

  // — per-frame simulation state —
  /** Heliocentric position, km, double precision. */
  realPosKm: { x: number; y: number; z: number }
  /** Heliocentric display position, scene units, double precision. */
  displayPos: { x: number; y: number; z: number }
  /** Display radius under the active scale mode, scene units. */
  displayRadius: number
  /** Category visibility resolved this frame. */
  visibleNow: boolean

  // — per-frame screen-space state (labels + picking) —
  screenX: number
  screenY: number
  onScreen: boolean
  projectedRadiusPx: number
}

function makeRuntimeBody(
  source: PlanetData | MoonData | CometData | NamedAsteroidData,
  parent?: RuntimeBody,
): RuntimeBody {
  return {
    id: source.id,
    name: source.name,
    category: source.category,
    physical: source.physical,
    color: source.color,
    surface: source.surface,
    orbit: 'orbit' in source ? source.orbit : undefined,
    rotation: 'rotation' in source ? source.rotation : undefined,
    rings: 'rings' in source ? source.rings : undefined,
    parent,
    source,
    realPosKm: { x: 0, y: 0, z: 0 },
    displayPos: { x: 0, y: 0, z: 0 },
    displayRadius: 0,
    visibleNow: true,
    screenX: 0,
    screenY: 0,
    onScreen: false,
    projectedRadiusPx: 0,
  }
}

export class BodyRegistry {
  /** Parent-before-child order (sun, planets/dwarfs/small bodies, moons). */
  readonly ordered: RuntimeBody[] = []
  readonly byId = new Map<string, RuntimeBody>()
  sun!: RuntimeBody

  static build(
    planets: PlanetData[],
    moons: MoonData[],
    comets: CometData[],
    namedAsteroids: NamedAsteroidData[],
  ): BodyRegistry {
    const registry = new BodyRegistry()
    for (const p of planets) registry.add(makeRuntimeBody(p))
    for (const c of comets) registry.add(makeRuntimeBody(c))
    for (const a of namedAsteroids) registry.add(makeRuntimeBody(a))
    for (const m of moons) {
      const parent = registry.byId.get(m.parentId)
      if (!parent) {
        console.warn(`Moon ${m.id} references unknown parent ${m.parentId}; skipped`)
        continue
      }
      registry.add(makeRuntimeBody(m, parent))
    }
    const sun = registry.ordered.find((b) => b.category === 'star')
    if (!sun) throw new Error('Dataset contains no star')
    registry.sun = sun
    return registry
  }

  private add(body: RuntimeBody): void {
    this.ordered.push(body)
    this.byId.set(body.id, body)
  }

  /**
   * Advance simulation state for every body and derive display positions
   * under the given scale mode. Runs in double precision throughout.
   */
  updatePositions(simTimeSec: number, mode: ScaleMode): void {
    for (const body of this.ordered) {
      body.displayRadius = mode.bodyRadius(body.physical.radiusKm, body.category)

      if (!body.orbit) {
        // The Sun.
        body.realPosKm.x = body.realPosKm.y = body.realPosKm.z = 0
        body.displayPos.x = body.displayPos.y = body.displayPos.z = 0
        continue
      }

      positionAtTime(body.orbit, simTimeSec, body.realPosKm)

      if (body.parent) {
        // Moon: planetocentric real offset, display-compressed per mode.
        const local = body.realPosKm
        const r = Math.hypot(local.x, local.y, local.z) || 1
        const displayR = mode.moonOrbitRadius(
          r,
          body.parent.physical.radiusKm,
          body.parent.displayRadius,
        )
        const k = displayR / r
        body.displayPos.x = body.parent.displayPos.x + local.x * k
        body.displayPos.y = body.parent.displayPos.y + local.y * k
        body.displayPos.z = body.parent.displayPos.z + local.z * k
        // Real position becomes heliocentric for light-travel/readouts.
        local.x += body.parent.realPosKm.x
        local.y += body.parent.realPosKm.y
        local.z += body.parent.realPosKm.z
      } else {
        const p = body.realPosKm
        const r = Math.hypot(p.x, p.y, p.z) || 1
        const k = mode.helioDistance(r) / r
        body.displayPos.x = p.x * k
        body.displayPos.y = p.y * k
        body.displayPos.z = p.z * k
      }
    }
  }

  /** Distance from the Sun in km (call after updatePositions). */
  sunDistanceKm(body: RuntimeBody): number {
    const p = body.realPosKm
    return Math.hypot(p.x, p.y, p.z)
  }
}

/** Scratch vector helpers for callers that need three.js math. */
export const tmpVecA = new Vector3()
export const tmpVecB = new Vector3()
