import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  type Scene,
} from 'three/webgpu'
import type { OrbitPathChunk } from '../data/types'
import type { BodyRegistry, RuntimeBody } from './bodies'
import type { ScaleMode } from '../simulation/scaleModes'
import { sampleOrbitPath } from '../simulation/orbitalMotion'
import type { VisibilityState } from '../state/stores'

/**
 * Orbit path lines.
 *
 * Heliocentric paths come pre-sampled in km from `orbit-paths.v1.bin`; on a
 * scale-mode switch each vertex is pushed through the mode's radial
 * transform (a few thousand points — instant). Moon paths are sampled at
 * runtime because their display radius depends on the parent's display size.
 *
 * Heliocentric lines live in one group offset by −focus (their vertices are
 * f32 at heliocentric magnitudes, so they fade out at close zoom, where
 * float jitter would otherwise show). Moon lines are re-positioned per frame
 * in double precision at their parent, so they stay crisp when zoomed in.
 */

interface HelioPath {
  body: RuntimeBody
  sourceKm: Float32Array
  line: Line
  material: LineBasicMaterial
}

interface MoonPath {
  body: RuntimeBody
  line: Line
  material: LineBasicMaterial
}

const MOON_PATH_SEGMENTS = 128

export class OrbitPathRenderer {
  private readonly helioGroup = new Group()
  private readonly helioPaths: HelioPath[] = []
  private readonly moonPaths: MoonPath[] = []

  constructor(
    scene: Scene,
    registry: BodyRegistry,
    chunk: OrbitPathChunk,
  ) {
    scene.add(this.helioGroup)

    for (const entry of chunk.entries) {
      const body = registry.byId.get(entry.bodyId)
      if (!body) continue
      const geometry = new BufferGeometry()
      // +1 vertex: WebGPURenderer has no LineLoop, so we close loops manually.
      geometry.setAttribute(
        'position',
        new BufferAttribute(new Float32Array(entry.positionsKm.length + 3), 3),
      )
      const material = new LineBasicMaterial({
        color: body.color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
      const line = new Line(geometry, material)
      line.frustumCulled = false
      this.helioGroup.add(line)
      this.helioPaths.push({ body, sourceKm: entry.positionsKm, line, material })
    }

    for (const body of registry.ordered) {
      if (body.category !== 'moon' || !body.orbit || !body.parent) continue
      const geometry = new BufferGeometry()
      geometry.setAttribute(
        'position',
        new BufferAttribute(new Float32Array((MOON_PATH_SEGMENTS + 1) * 3), 3),
      )
      const material = new LineBasicMaterial({
        color: body.color,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      })
      const line = new Line(geometry, material)
      line.frustumCulled = false
      scene.add(line)
      this.moonPaths.push({ body, line, material })
    }
  }

  /** Re-project all path vertices for a new scale mode. */
  rebuild(mode: ScaleMode): void {
    for (const { sourceKm, line } of this.helioPaths) {
      const attr = line.geometry.attributes.position as BufferAttribute
      const out = attr.array as Float32Array
      for (let i = 0; i < sourceKm.length; i += 3) {
        const x = sourceKm[i]
        const y = sourceKm[i + 1]
        const z = sourceKm[i + 2]
        const r = Math.hypot(x, y, z) || 1
        const k = mode.helioDistance(r) / r
        out[i] = x * k
        out[i + 1] = y * k
        out[i + 2] = z * k
      }
      closeLoop(out)
      attr.needsUpdate = true
      line.geometry.computeBoundingSphere()
    }

    for (const { body, line } of this.moonPaths) {
      const parent = body.parent!
      const parentDisplayRadius = mode.bodyRadius(parent.physical.radiusKm, parent.category)
      const samplesKm = sampleOrbitPath(body.orbit!, MOON_PATH_SEGMENTS)
      const attr = line.geometry.attributes.position as BufferAttribute
      const out = attr.array as Float32Array
      for (let i = 0; i < samplesKm.length; i += 3) {
        const x = samplesKm[i]
        const y = samplesKm[i + 1]
        const z = samplesKm[i + 2]
        const r = Math.hypot(x, y, z) || 1
        const k = mode.moonOrbitRadius(r, parent.physical.radiusKm, parentDisplayRadius) / r
        out[i] = x * k
        out[i + 1] = y * k
        out[i + 2] = z * k
      }
      closeLoop(out)
      attr.needsUpdate = true
      line.geometry.computeBoundingSphere()
    }
  }

  update(
    focus: { x: number; y: number; z: number },
    focusDisplayRadius: number,
    cameraDistance: number,
    visibilityState: VisibilityState,
  ): void {
    const showOrbits = visibilityState.orbits
    // Fade heliocentric lines while zoomed close to a body: hides both
    // visual clutter and f32 vertex jitter at planetary scales.
    const fade = Math.min(1, cameraDistance / Math.max(focusDisplayRadius * 250, 1e-9))
    this.helioGroup.visible = showOrbits && fade > 0.02
    this.helioGroup.position.set(-focus.x, -focus.y, -focus.z)

    for (const { body, material, line } of this.helioPaths) {
      const categoryOn =
        body.category === 'planet'
          ? visibilityState.planets
          : body.category === 'dwarfPlanet'
            ? visibilityState.dwarfPlanets
            : body.category === 'comet'
              ? visibilityState.comets
              : visibilityState.asteroids
      line.visible = categoryOn
      material.opacity = 0.35 * fade
    }

    for (const { body, line, material } of this.moonPaths) {
      const parent = body.parent!
      line.visible = showOrbits && visibilityState.moons
      if (!line.visible) continue
      line.position.set(
        parent.displayPos.x - focus.x,
        parent.displayPos.y - focus.y,
        parent.displayPos.z - focus.z,
      )
      // Moon paths only matter near their parent; fade them out at range.
      const parentDist = Math.hypot(line.position.x, line.position.y, line.position.z)
      const proximity = Math.min(1, (parent.displayRadius * 800) / Math.max(parentDist, 1e-9))
      material.opacity = 0.25 * proximity
      line.visible = line.visible && proximity > 0.05
    }
  }
}

/** Copy the first vertex into the trailing slot so the polyline closes. */
function closeLoop(positions: Float32Array): void {
  const n = positions.length
  positions[n - 3] = positions[0]
  positions[n - 2] = positions[1]
  positions[n - 1] = positions[2]
}
