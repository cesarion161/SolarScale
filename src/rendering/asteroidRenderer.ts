import {
  Color,
  InstancedMesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  type Scene,
} from 'three/webgpu'
import type { AsteroidFieldChunk, AsteroidGroup } from '../data/types'
import type { AsteroidFieldSimulator } from '../gpu/AsteroidFieldSimulator'
import { type ScaleMode } from '../simulation/scaleModes'

/**
 * Dense asteroid-field renderer: one InstancedMesh for the whole field
 * (single draw call), fed by an AsteroidFieldSimulator behind the /src/gpu
 * boundary. Instance matrices are pure scale+translation, written straight
 * into the attribute array.
 *
 * Each asteroid keeps a distance-adaptive minimum size so the belts read as
 * a sparse dust of dots at system scale without lying about clustering.
 */

const GROUP_COLORS: Record<AsteroidGroup, string> = {
  mainBelt: '#a99a86',
  trojans: '#94896f',
  kuiperBelt: '#93a8bd',
}

export class AsteroidRenderer {
  private mesh: InstancedMesh | null = null
  private count = 0
  private records: Float32Array = new Float32Array(0)
  private stride = 8

  constructor(
    private readonly scene: Scene,
    private readonly simulator: AsteroidFieldSimulator,
  ) {}

  setField(chunk: AsteroidFieldChunk): void {
    this.disposeMesh()
    this.simulator.setField(chunk)
    this.count = chunk.count
    this.records = chunk.records
    this.stride = chunk.stride

    const geometry = new OctahedronGeometry(1, 0)
    const material = new MeshBasicMaterial()
    const mesh = new InstancedMesh(geometry, material, chunk.count)
    mesh.frustumCulled = false

    const color = new Color()
    const groupNames = Object.keys(GROUP_COLORS) as AsteroidGroup[]
    for (let i = 0; i < chunk.count; i++) {
      const groupIndex = chunk.records[i * chunk.stride + 7]
      color.set(GROUP_COLORS[groupNames[groupIndex] ?? 'mainBelt'])
      mesh.setColorAt(i, color)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    this.mesh = mesh
    this.scene.add(mesh)
  }

  update(
    simTimeSec: number,
    mode: ScaleMode,
    focus: { x: number; y: number; z: number },
    cameraPos: { x: number; y: number; z: number },
    visible: boolean,
  ): void {
    const mesh = this.mesh
    if (!mesh) return
    mesh.visible = visible
    if (!visible) return

    const positionsKm = this.simulator.computePositionsKm(simTimeSec)
    const matrices = mesh.instanceMatrix.array as Float32Array
    // In true scale, bodies render at genuine size only: a 50 km asteroid is
    // sub-pixel everywhere, and pretending otherwise would undercut the mode.
    const useScreenFloor = !mode.sizesReal

    for (let i = 0; i < this.count; i++) {
      const xKm = positionsKm[i * 3]
      const yKm = positionsKm[i * 3 + 1]
      const zKm = positionsKm[i * 3 + 2]
      const rKm = Math.hypot(xKm, yKm, zKm) || 1
      const k = mode.helioDistance(rKm) / rKm
      const x = xKm * k - focus.x
      const y = yKm * k - focus.y
      const z = zKm * k - focus.z

      // Size: real display radius, floored to a small screen-space presence
      // (except in true scale — see above).
      const radiusKm = this.records[i * this.stride + 6]
      const displayRadius = mode.bodyRadius(radiusKm, 'asteroid')
      let s = displayRadius
      if (useScreenFloor) {
        const camDist = Math.hypot(x - cameraPos.x, y - cameraPos.y, z - cameraPos.z)
        s = Math.max(displayRadius, camDist * 8e-4)
      }

      const o = i * 16
      matrices[o] = s
      matrices[o + 5] = s
      matrices[o + 10] = s
      matrices[o + 12] = x
      matrices[o + 13] = y
      matrices[o + 14] = z
      matrices[o + 15] = 1
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  private disposeMesh(): void {
    if (!this.mesh) return
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshBasicMaterial).dispose()
    this.mesh.dispose()
    this.mesh = null
  }

  dispose(): void {
    this.disposeMesh()
    this.simulator.dispose()
  }
}
