import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Scene,
  SphereGeometry,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu'
import type { SolarSystemDataProvider } from '../data/SolarSystemDataProvider'
import type { AsteroidFieldChunk, OrbitPathChunk } from '../data/types'
import { createRenderer } from './renderer'
import { CameraController } from './camera'
import { BodyRegistry, type RuntimeBody } from './bodies'
import { PlanetRenderer } from './planetRenderer'
import { MoonRenderer } from './moonRenderer'
import { CometRenderer } from './cometRenderer'
import { AsteroidRenderer } from './asteroidRenderer'
import { OrbitPathRenderer } from './orbitPathRenderer'
import { LabelRenderer } from './labelRenderer'
import { LightPropagationRenderer } from './lightPropagationRenderer'
import { createStarfieldTexture } from './materials'
import { SimulationClock } from '../simulation/simulationClock'
import { LightTravelSimulation, lightTravelTimeSec } from '../simulation/lightTravel'
import {
  AU_KM,
  KM_PER_UNIT,
  SCALE_MODES,
  type ScaleMode,
  type ScaleModeId,
} from '../simulation/scaleModes'
import { CpuAsteroidFieldSimulator } from '../gpu/CpuAsteroidFieldSimulator'
import {
  bodyCatalog,
  engineCommand,
  liveReadout,
  paused,
  scaleMode,
  selectedObjectId,
  timeScale,
  visibility,
  type BodySummary,
  type VisibilityState,
} from '../state/stores'
import { selectObject } from '../state/appState'

/**
 * The engine: owns the three.js scene, the WebGPU render loop and the
 * simulation. Subscribes to the high-level Svelte stores for coarse state
 * (selection, scale mode, toggles, speed) and pushes throttled readouts
 * back; nothing per-frame ever crosses the store boundary.
 */

const FOCUS_TRANSITION_SEC = 1.5
const READOUT_INTERVAL_SEC = 0.25

export class SolarSystemEngine {
  private readonly scene = new Scene()
  private readonly cameraCtl: CameraController
  private readonly registry: BodyRegistry
  private readonly clock = new SimulationClock()
  private readonly lightSim = new LightTravelSimulation()

  private readonly planetRenderer: PlanetRenderer
  private readonly moonRenderer: MoonRenderer
  private readonly cometRenderer: CometRenderer
  private readonly asteroidRenderer: AsteroidRenderer
  private readonly orbitRenderer: OrbitPathRenderer
  private readonly labelRenderer: LabelRenderer
  private readonly lightRenderer: LightPropagationRenderer

  private readonly sunLight = new PointLight(0xffffff, 3.0, 0, 0)
  private readonly starfield: Mesh

  private mode: ScaleMode = SCALE_MODES.exaggerated
  private visibilityState!: VisibilityState
  private selectedId: string | null = null

  // Floating-origin focus (interpolated during focus transitions).
  private focusFrom: RuntimeBody
  private focusTo: RuntimeBody
  private focusT = 1
  private readonly focus = { x: 0, y: 0, z: 0 }

  private width = 1
  private height = 1
  private lastFrameTime = performance.now()
  private readoutAccumulator = 0
  private pointerDownPos: { x: number; y: number } | null = null

  private readonly unsubscribers: (() => void)[] = []
  private readonly resizeObserver: ResizeObserver
  private readonly tmpVec = new Vector3()

  private constructor(
    private readonly container: HTMLElement,
    private readonly renderer: WebGPURenderer,
    registry: BodyRegistry,
    orbitPaths: OrbitPathChunk,
    asteroidChunk: AsteroidFieldChunk,
  ) {
    this.registry = registry
    this.focusFrom = registry.sun
    this.focusTo = registry.sun

    this.cameraCtl = new CameraController(1)
    const canvas = renderer.domElement
    Object.assign(canvas.style, { position: 'absolute', inset: '0', touchAction: 'none' })
    this.cameraCtl.attach(canvas)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)

    this.scene.add(new AmbientLight(0x93a4c4, 0.5))
    this.scene.add(this.sunLight)

    this.starfield = new Mesh(
      new SphereGeometry(1, 48, 24),
      new MeshBasicMaterial({
        map: createStarfieldTexture(),
        side: BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    )
    this.starfield.renderOrder = -100
    this.starfield.rotation.z = 1.08 // incline the Milky-Way band
    this.starfield.frustumCulled = false
    this.scene.add(this.starfield)

    this.planetRenderer = new PlanetRenderer(this.scene, registry.ordered)
    this.moonRenderer = new MoonRenderer(this.scene, registry.ordered)
    this.cometRenderer = new CometRenderer(this.scene, registry.ordered)
    this.orbitRenderer = new OrbitPathRenderer(this.scene, registry, orbitPaths)
    this.orbitRenderer.rebuild(this.mode)
    this.asteroidRenderer = new AsteroidRenderer(this.scene, new CpuAsteroidFieldSimulator())
    this.asteroidRenderer.setField(asteroidChunk)
    this.labelRenderer = new LabelRenderer(container)
    this.lightRenderer = new LightPropagationRenderer(this.scene)

    this.publishCatalog()
    this.subscribeStores()
    this.cameraCtl.snapToDistance(this.defaultViewDistance(this.mode))

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(container)
    this.handleResize()

    renderer.setAnimationLoop(() => this.frame())
  }

  static async create(
    container: HTMLElement,
    provider: SolarSystemDataProvider,
  ): Promise<SolarSystemEngine> {
    const canvas = document.createElement('canvas')
    container.appendChild(canvas)
    const renderer = await createRenderer(canvas).catch((err) => {
      canvas.remove()
      throw err
    })
    renderer.toneMapping = ACESFilmicToneMapping

    const [planets, moons, comets, namedAsteroids, asteroidChunk, orbitPaths] =
      await Promise.all([
        provider.loadPlanets(),
        provider.loadMoons(),
        provider.loadComets(),
        provider.loadNamedAsteroids(),
        provider.loadAsteroids({ maxCount: 12_000 }),
        provider.loadOrbitPaths(),
      ])

    const registry = BodyRegistry.build(planets, moons, comets, namedAsteroids)
    const engine = new SolarSystemEngine(container, renderer, registry, orbitPaths, asteroidChunk)
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__solarScaleEngine = engine
    }
    return engine
  }

  // ————— store wiring —————

  private subscribeStores(): void {
    let prevMode = this.mode
    this.unsubscribers.push(
      scaleMode.subscribe((id: ScaleModeId) => {
        const next = SCALE_MODES[id]
        this.mode = next
        this.orbitRenderer.rebuild(next)
        this.reframeCameraForMode(prevMode, next)
        prevMode = next
      }),
      visibility.subscribe((v) => {
        const wasOn = this.visibilityState?.lightTravel ?? false
        this.visibilityState = v
        if (v.lightTravel !== wasOn) {
          this.lightSim.setAutoEmit(v.lightTravel, this.clock.timeSec)
          if (!v.lightTravel) this.lightSim.clear()
        }
      }),
      timeScale.subscribe((v) => (this.clock.timeScale = v)),
      paused.subscribe((v) => (this.clock.isPaused = v)),
      selectedObjectId.subscribe((id) => this.handleSelection(id)),
      engineCommand.subscribe((cmd) => {
        if (!cmd) return
        if (cmd.command.kind === 'emitLightPulse') {
          this.lightSim.emit(this.clock.timeSec)
        } else if (cmd.command.kind === 'clearLightPulses') {
          // Clear AND stop auto-emission, otherwise a new pulse would pop up
          // within one interval and the button would feel broken. "Emit light
          // pulse" or re-toggling the layer starts things up again.
          this.lightSim.setAutoEmit(false, this.clock.timeSec)
          this.lightSim.clear()
        } else if (cmd.command.kind === 'resetView') {
          this.cameraCtl.clearPan()
          this.cameraCtl.flyToDistance(this.defaultViewDistance(this.mode))
        }
      }),
    )
  }

  private handleSelection(id: string | null): void {
    this.selectedId = id
    const target = (id && this.registry.byId.get(id)) || this.registry.sun
    if (target === this.focusTo) return
    this.focusFrom = this.focusTo
    this.focusTo = target
    this.focusT = 0
    this.cameraCtl.clearPan()
    if (target === this.registry.sun) {
      this.cameraCtl.flyToDistance(this.defaultViewDistance(this.mode))
    } else {
      const radius = this.mode.bodyRadius(target.physical.radiusKm, target.category)
      // Lower the zoom floor to the NEW target first — flyToDistance clamps
      // at call time, and the floor may still belong to a much larger body.
      this.cameraCtl.setMinDistance(Math.max(radius * 1.7, 1e-5))
      this.cameraCtl.flyToDistance(Math.max(radius * 7, 1e-4))
    }
  }

  private defaultViewDistance(mode: ScaleMode): number {
    // Frames the whole system with Neptune's orbit comfortably inside view.
    return mode.helioDistance(32 * AU_KM) * 2.3
  }

  private reframeCameraForMode(prev: ScaleMode, next: ScaleMode): void {
    const body = this.focusTo
    const prevR = prev.bodyRadius(body.physical.radiusKm, body.category)
    const nextR = next.bodyRadius(body.physical.radiusKm, body.category)
    // Update the zoom floor first so the snap isn't clamped by the old mode.
    this.cameraCtl.setMinDistance(Math.max(nextR * 1.7, 1e-5))
    const dist = this.cameraCtl.currentDistance
    if (body === this.registry.sun && dist > prevR * 40) {
      // System-wide view: reframe against the system extent instead.
      const scale = next.helioDistance(30 * AU_KM) / prev.helioDistance(30 * AU_KM)
      this.cameraCtl.snapToDistance(dist * scale)
    } else {
      this.cameraCtl.snapToDistance(dist * (nextR / prevR))
    }
  }

  private publishCatalog(): void {
    const summaries: BodySummary[] = this.registry.ordered.map((b) => ({
      id: b.id,
      name: b.name,
      category: b.category,
      parentId: b.parent?.id,
      radiusKm: b.physical.radiusKm,
      massKg: b.physical.massKg,
      orbitPeriodSec: b.orbit ? Math.abs(b.orbit.periodSec) : undefined,
      rotationPeriodSec: b.rotation?.periodSec,
      axialTiltRad: b.rotation?.axialTiltRad,
      semiMajorAxisKm: b.orbit?.semiMajorAxisKm,
      color: b.color,
      description: b.source.description,
      facts: b.source.facts,
    }))
    bodyCatalog.set(summaries)
  }

  // ————— per-frame —————

  private frame(): void {
    const now = performance.now()
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1)
    this.lastFrameTime = now

    this.clock.tick(dt)
    const simTime = this.clock.timeSec
    this.lightSim.update(simTime)

    this.registry.updatePositions(simTime, this.mode)
    this.updateFocus(dt)
    this.resolveVisibility()

    const focusBody = this.focusTo
    this.cameraCtl.setMinDistance(Math.max(focusBody.displayRadius * 1.7, 1e-5))
    this.updateCameraProximity()
    this.cameraCtl.update(dt)
    const camera = this.cameraCtl.camera
    camera.updateMatrixWorld()

    const focus = this.focus
    this.planetRenderer.update(this.registry.ordered, focus, simTime)
    this.moonRenderer.update(this.registry.ordered, focus, simTime)
    this.cometRenderer.update(this.registry.ordered, focus, simTime, this.mode)
    this.asteroidRenderer.update(
      simTime,
      this.mode,
      focus,
      camera.position,
      this.visibilityState.asteroids,
    )
    this.orbitRenderer.update(
      focus,
      focusBody.displayRadius,
      this.cameraCtl.currentDistance,
      this.visibilityState,
    )

    const sun = this.registry.sun
    const sunRel = {
      x: sun.displayPos.x - focus.x,
      y: sun.displayPos.y - focus.y,
      z: sun.displayPos.z - focus.z,
    }
    this.sunLight.position.set(sunRel.x, sunRel.y, sunRel.z)
    this.lightRenderer.update(
      this.lightSim.radiiKm(simTime),
      this.mode,
      sunRel,
      this.visibilityState.lightTravel,
    )

    this.starfield.position.copy(camera.position)
    this.starfield.scale.setScalar(camera.far * 0.45)

    this.projectBodies()
    this.labelRenderer.draw(
      this.registry.ordered,
      this.selectedId,
      this.visibilityState.labels,
      !this.mode.sizesReal,
    )

    this.readoutAccumulator += dt
    if (this.readoutAccumulator >= READOUT_INTERVAL_SEC) {
      this.readoutAccumulator = 0
      this.pushReadout(simTime)
    }

    this.renderer.render(this.scene, camera)
  }

  /**
   * Feed the controller the distance from the camera to the nearest visible
   * body surface (uses last frame's camera position — one frame of lag is
   * imperceptible). This keeps rotate/pan/zoom sensitivity sane while
   * skimming past bodies the camera is not focused on.
   */
  private updateCameraProximity(): void {
    const cam = this.cameraCtl.camera.position
    let best = Infinity
    for (const body of this.registry.ordered) {
      if (!body.visibleNow) continue
      const dx = body.displayPos.x - this.focus.x - cam.x
      const dy = body.displayPos.y - this.focus.y - cam.y
      const dz = body.displayPos.z - this.focus.z - cam.z
      const d = Math.hypot(dx, dy, dz) - body.displayRadius
      if (d < best) best = d
    }
    this.cameraCtl.setProximity(best)
  }

  private updateFocus(dt: number): void {
    if (this.focusT < 1) {
      this.focusT = Math.min(1, this.focusT + dt / FOCUS_TRANSITION_SEC)
    }
    const t = this.focusT
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    const a = this.focusFrom.displayPos
    const b = this.focusTo.displayPos
    this.focus.x = a.x + (b.x - a.x) * e
    this.focus.y = a.y + (b.y - a.y) * e
    this.focus.z = a.z + (b.z - a.z) * e
  }

  private resolveVisibility(): void {
    const v = this.visibilityState
    for (const body of this.registry.ordered) {
      switch (body.category) {
        case 'star':
          body.visibleNow = true
          break
        case 'planet':
          body.visibleNow = v.planets
          break
        case 'dwarfPlanet':
          body.visibleNow = v.dwarfPlanets
          break
        case 'moon':
          body.visibleNow = v.moons && (body.parent?.visibleNow ?? true)
          break
        case 'asteroid':
          body.visibleNow = v.asteroids
          break
        case 'comet':
          body.visibleNow = v.comets
          break
      }
    }
  }

  private projectBodies(): void {
    const camera = this.cameraCtl.camera
    const projScale =
      this.height / (2 * Math.tan((camera.fov * Math.PI) / 360))
    for (const body of this.registry.ordered) {
      const v = this.tmpVec.set(
        body.displayPos.x - this.focus.x,
        body.displayPos.y - this.focus.y,
        body.displayPos.z - this.focus.z,
      )
      v.applyMatrix4(camera.matrixWorldInverse)
      const viewZ = v.z
      if (viewZ > -1e-9) {
        body.onScreen = false
        continue
      }
      body.projectedRadiusPx = (body.displayRadius / -viewZ) * projScale
      v.applyMatrix4(camera.projectionMatrix)
      body.onScreen = Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05
      body.screenX = (v.x * 0.5 + 0.5) * this.width
      body.screenY = (-v.y * 0.5 + 0.5) * this.height
    }
  }

  private pushReadout(simTime: number): void {
    const selected = this.selectedId ? this.registry.byId.get(this.selectedId) : null
    const pulseAge = this.lightSim.newestPulseAgeSec(simTime)
    const planets = this.registry.ordered.filter((b) => b.category === 'planet')

    // Camera → selected body's surface, in km (display units are km/1e6;
    // exact whenever the active mode keeps distances real).
    let selectedCameraDistanceKm: number | null = null
    if (selected) {
      const cam = this.cameraCtl.camera.position
      const dx = selected.displayPos.x - this.focus.x - cam.x
      const dy = selected.displayPos.y - this.focus.y - cam.y
      const dz = selected.displayPos.z - this.focus.z - cam.z
      const surfaceDist = Math.max(Math.hypot(dx, dy, dz) - selected.displayRadius, 0)
      selectedCameraDistanceKm = surfaceDist * KM_PER_UNIT
    }

    liveReadout.set({
      simDateIso: this.clock.toDate().toISOString(),
      selectedSunDistanceKm: selected ? this.registry.sunDistanceKm(selected) : null,
      selectedCameraDistanceKm,
      cameraDistanceKm: this.cameraCtl.currentDistance * KM_PER_UNIT,
      kmPerPixel: this.mode.distancesReal
        ? ((2 *
            this.cameraCtl.currentDistance *
            Math.tan((this.cameraCtl.camera.fov * Math.PI) / 360)) /
            this.height) *
          KM_PER_UNIT
        : 0,
      lightPulseAgeSec: pulseAge,
      lightArrivals: planets.map((p) => {
        const travelTimeSec = lightTravelTimeSec(this.registry.sunDistanceKm(p))
        return {
          id: p.id,
          name: p.name,
          travelTimeSec,
          reached: pulseAge !== null && pulseAge >= travelTimeSec,
        }
      }),
    })
  }

  // ————— input —————

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY }
  }

  private onPointerUp = (e: PointerEvent): void => {
    const down = this.pointerDownPos
    this.pointerDownPos = null
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return
    const rect = this.container.getBoundingClientRect()
    const picked = this.labelRenderer.pick(e.clientX - rect.left, e.clientY - rect.top)
    selectObject(picked ? picked.id : null)
  }

  private handleResize(): void {
    this.width = Math.max(1, this.container.clientWidth)
    this.height = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(this.width, this.height)
    this.cameraCtl.setAspect(this.width / this.height)
    this.labelRenderer.resize(this.width, this.height, Math.min(window.devicePixelRatio, 2))
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    for (const unsub of this.unsubscribers) unsub()
    this.resizeObserver.disconnect()
    this.cameraCtl.dispose()
    this.asteroidRenderer.dispose()
    this.labelRenderer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
