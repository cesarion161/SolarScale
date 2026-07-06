import {
  AdditiveBlending,
  ConeGeometry,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
} from 'three/webgpu'
import type { RuntimeBody } from './bodies'
import {
  createSphereBodyVisual,
  updateSphereBodyVisual,
  type SphereBodyVisual,
} from './planetRenderer'
import { createGlowTexture } from './materials'
import { AU_KM, type ScaleMode } from '../simulation/scaleModes'

/**
 * Comets and named large asteroids: a sphere-body nucleus plus, for comets,
 * a coma glow and an anti-sunward dust tail whose length follows solar
 * distance (comet tails really are astronomically long — up to ~0.5 AU —
 * so at true scale a near-perihelion tail dwarfs any planet).
 */

interface CometVisual extends SphereBodyVisual {
  coma?: Sprite
  tail?: Mesh
}

const TAIL_GEOMETRY = new ConeGeometry(0.35, 1, 12, 1, true)
TAIL_GEOMETRY.translate(0, 0.5, 0) // apex at origin, extends along +Y

const Y_AXIS = new Vector3(0, 1, 0)
const tmpDir = new Vector3()
const tmpQuat = new Quaternion()

/** Real tail length in km given solar distance (educational approximation). */
function tailLengthKm(sunDistKm: number): number {
  const distAu = sunDistKm / AU_KM
  return 6e7 * Math.exp(-(distAu - 0.5) / 2.2)
}

export class CometRenderer {
  private readonly visuals = new Map<string, CometVisual>()

  constructor(scene: Scene, bodies: RuntimeBody[]) {
    for (const body of bodies) {
      if (body.category !== 'comet' && body.category !== 'asteroid') continue
      const visual: CometVisual = createSphereBodyVisual(body, true)
      if (body.category === 'comet') {
        visual.coma = createComa()
        visual.root.add(visual.coma)
        visual.tail = createTail()
        // Tail scales independently of the nucleus, so it lives outside root.
        scene.add(visual.tail)
      }
      this.visuals.set(body.id, visual)
      scene.add(visual.root)
    }
  }

  update(
    bodies: RuntimeBody[],
    focus: { x: number; y: number; z: number },
    simTimeSec: number,
    mode: ScaleMode,
  ): void {
    for (const body of bodies) {
      const visual = this.visuals.get(body.id)
      if (!visual) continue
      updateSphereBodyVisual(visual, body, focus, simTimeSec)
      if (!visual.tail) continue

      const sunDistKm = Math.hypot(body.realPosKm.x, body.realPosKm.y, body.realPosKm.z)
      const lenKm = tailLengthKm(sunDistKm)
      // Radial anti-sunward tail: endpoints at r and r+len map through the
      // (possibly nonlinear) mode transform to stay physically consistent.
      const displayLen = mode.helioDistance(sunDistKm + lenKm) - mode.helioDistance(sunDistKm)
      const visible =
        body.visibleNow && displayLen > body.displayRadius * 3 && displayLen > 1e-4
      visual.tail.visible = visible
      if (visual.coma) visual.coma.scale.setScalar(4 + Math.min(20, lenKm / 2e6))
      if (!visible) continue

      tmpDir.set(body.displayPos.x, body.displayPos.y, body.displayPos.z).normalize()
      visual.tail.position.set(
        body.displayPos.x - focus.x,
        body.displayPos.y - focus.y,
        body.displayPos.z - focus.z,
      )
      visual.tail.quaternion.copy(tmpQuat.setFromUnitVectors(Y_AXIS, tmpDir))
      const width = Math.max(displayLen * 0.14, body.displayRadius * 2)
      visual.tail.scale.set(width, displayLen, width)
    }
  }
}

function createComa(): Sprite {
  const material = new SpriteMaterial({
    map: createGlowTexture('rgba(210,235,255,1)', 'rgba(120,180,255,0)'),
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.55,
  })
  return new Sprite(material)
}

function createTail(): Mesh {
  const material = new MeshBasicMaterial({
    color: 0x9fc8ff,
    transparent: true,
    opacity: 0.16,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  const mesh = new Mesh(TAIL_GEOMETRY, material)
  mesh.visible = false
  return mesh
}
