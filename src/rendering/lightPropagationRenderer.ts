import {
  AdditiveBlending,
  BackSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  type Scene,
} from 'three/webgpu'
import type { ScaleMode } from '../simulation/scaleModes'

/**
 * Sunlight wavefront visualization: each pulse is an expanding ring in the
 * ecliptic plus a very faint sphere shell. Radii arrive in real km from the
 * LightTravelSimulation and are mapped through the active scale mode, so a
 * wavefront visually touches Earth exactly when its real radius is 1 AU —
 * about 8 minutes 19 seconds of simulated time after emission.
 *
 * The MVP updates a small pool of meshes on the CPU; a future WGSL module
 * can replace this with a GPU-evaluated wavefront field (see /src/gpu).
 */

const POOL_SIZE = 6

interface PulseVisual {
  ring: Mesh
  shell: Mesh
  ringMaterial: MeshBasicMaterial
  shellMaterial: MeshBasicMaterial
}

export class LightPropagationRenderer {
  private readonly group = new Group()
  private readonly pool: PulseVisual[] = []

  constructor(scene: Scene) {
    const ringGeometry = new RingGeometry(0.985, 1, 256)
    ringGeometry.rotateX(-Math.PI / 2) // into the ecliptic (XZ) plane
    const shellGeometry = new SphereGeometry(1, 48, 24)

    for (let i = 0; i < POOL_SIZE; i++) {
      const ringMaterial = new MeshBasicMaterial({
        color: 0x9fdcff,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      })
      const shellMaterial = new MeshBasicMaterial({
        color: 0x6fb8ff,
        transparent: true,
        opacity: 0.045,
        blending: AdditiveBlending,
        depthWrite: false,
        side: BackSide,
      })
      const ring = new Mesh(ringGeometry, ringMaterial)
      const shell = new Mesh(shellGeometry, shellMaterial)
      ring.visible = shell.visible = false
      ring.frustumCulled = shell.frustumCulled = false
      this.group.add(ring, shell)
      this.pool.push({ ring, shell, ringMaterial, shellMaterial })
    }
    scene.add(this.group)
  }

  /**
   * @param radiiKm wavefront radii in real km, oldest first
   * @param sunFocusRelative sun position minus focus, scene units
   */
  update(
    radiiKm: number[],
    mode: ScaleMode,
    sunFocusRelative: { x: number; y: number; z: number },
    visible: boolean,
  ): void {
    this.group.visible = visible
    if (!visible) return
    this.group.position.set(sunFocusRelative.x, sunFocusRelative.y, sunFocusRelative.z)

    for (let i = 0; i < this.pool.length; i++) {
      const visual = this.pool[i]
      const radiusKm = radiiKm[radiiKm.length - 1 - i] // newest gets slot 0
      if (radiusKm === undefined || radiusKm <= 0) {
        visual.ring.visible = visual.shell.visible = false
        continue
      }
      const displayRadius = mode.helioDistance(radiusKm)
      if (displayRadius < 1e-6) {
        visual.ring.visible = visual.shell.visible = false
        continue
      }
      // Newer pulses are brighter; everything decays gently with expansion.
      const age = i / POOL_SIZE
      visual.ring.visible = visual.shell.visible = true
      visual.ring.scale.setScalar(displayRadius)
      visual.shell.scale.setScalar(displayRadius)
      visual.ringMaterial.opacity = 0.65 * (1 - age * 0.7)
      visual.shellMaterial.opacity = 0.05 * (1 - age * 0.8)
    }
  }
}
