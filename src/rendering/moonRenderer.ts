import type { Scene } from 'three/webgpu'
import type { RuntimeBody } from './bodies'
import {
  createSphereBodyVisual,
  updateSphereBodyVisual,
  type SphereBodyVisual,
} from './planetRenderer'

/**
 * Renders the major moons. Moons reuse the sphere-body pipeline with a
 * lower-poly geometry; their (mode-dependent) positions around the parent
 * are already resolved by the BodyRegistry, so this stays a thin layer.
 */
export class MoonRenderer {
  private readonly visuals = new Map<string, SphereBodyVisual>()

  constructor(scene: Scene, bodies: RuntimeBody[]) {
    for (const body of bodies) {
      if (body.category !== 'moon') continue
      const visual = createSphereBodyVisual(body, true)
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
