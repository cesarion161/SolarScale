import {
  AdditiveBlending,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Scene,
} from 'three/webgpu'
import type { RuntimeBody } from './bodies'
import { createBodyMaterial, createGlowTexture, createRingTexture } from './materials'
import { spinAngleAtTime } from '../simulation/rotation'

/**
 * Renders every "sphere body" that orbits the Sun directly: the Sun itself,
 * planets and dwarf planets (moons and comets have their own renderers that
 * reuse the helpers exported here).
 *
 * Scene-graph per body:
 *   root (position = display pos − focus, uniform scale = display radius)
 *   └─ tilt (axial tilt, constant)
 *      ├─ sphere (spins around local Y)
 *      └─ rings (Saturn)
 */

export interface SphereBodyVisual {
  root: Group
  sphere: Mesh
}

const SPHERE_GEOMETRY = new SphereGeometry(1, 48, 24)
const SPHERE_GEOMETRY_LOW = new SphereGeometry(1, 24, 12)

export function createSphereBodyVisual(body: RuntimeBody, lowDetail = false): SphereBodyVisual {
  const root = new Group()
  root.name = body.id
  const tilt = new Group()
  root.add(tilt)

  const sphere = new Mesh(lowDetail ? SPHERE_GEOMETRY_LOW : SPHERE_GEOMETRY, createBodyMaterial(body))
  tilt.add(sphere)

  if (body.rotation) {
    // MVP tilt model: obliquity about the ecliptic X axis (axis precession
    // direction is not represented — noted in the educational annotations).
    tilt.rotation.x = body.rotation.axialTiltRad
  }

  if (body.rings) {
    tilt.add(createRingMesh(body.rings.innerRadiusFactor, body.rings.outerRadiusFactor))
  }

  return { root, sphere }
}

function createRingMesh(inner: number, outer: number): Mesh {
  const geometry = new RingGeometry(inner, outer, 160, 1)
  // Remap UV.x to the radial fraction so the 1-D ring texture reads as bands.
  const pos = geometry.attributes.position
  const uv = geometry.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i))
    uv.setXY(i, (r - inner) / (outer - inner), 0.5)
  }
  const material = new MeshStandardMaterial({
    map: createRingTexture(),
    transparent: true,
    side: DoubleSide,
    roughness: 0.9,
    metalness: 0,
    depthWrite: false,
  })
  const mesh = new Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  return mesh
}

/** Standard per-frame transform update shared by all sphere-body renderers. */
export function updateSphereBodyVisual(
  visual: SphereBodyVisual,
  body: RuntimeBody,
  focus: { x: number; y: number; z: number },
  simTimeSec: number,
): void {
  visual.root.visible = body.visibleNow
  if (!body.visibleNow) return
  // Floating origin: the subtraction happens here, in JS double precision.
  visual.root.position.set(
    body.displayPos.x - focus.x,
    body.displayPos.y - focus.y,
    body.displayPos.z - focus.z,
  )
  visual.root.scale.setScalar(body.displayRadius)
  if (body.rotation) {
    visual.sphere.rotation.y = spinAngleAtTime(body.rotation, simTimeSec)
  }
}

export class PlanetRenderer {
  private readonly visuals = new Map<string, SphereBodyVisual>()

  constructor(scene: Scene, bodies: RuntimeBody[]) {
    for (const body of bodies) {
      if (body.category !== 'star' && body.category !== 'planet' && body.category !== 'dwarfPlanet') {
        continue
      }
      const visual = createSphereBodyVisual(body)
      if (body.category === 'star') {
        visual.root.add(createSunGlow())
      }
      this.visuals.set(body.id, visual)
      scene.add(visual.root)
    }
  }

  update(
    bodies: RuntimeBody[],
    focus: { x: number; y: number; z: number },
    simTimeSec: number,
  ): void {
    for (const body of bodies) {
      const visual = this.visuals.get(body.id)
      if (visual) updateSphereBodyVisual(visual, body, focus, simTimeSec)
    }
  }
}

function createSunGlow(): Sprite {
  const material = new SpriteMaterial({
    map: createGlowTexture('rgba(255,235,190,1)', 'rgba(255,150,40,0)'),
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.9,
  })
  const sprite = new Sprite(material)
  sprite.scale.setScalar(7) // relative to the sun root scale (= radius)
  return sprite
}
