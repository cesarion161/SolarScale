import { MathUtils, PerspectiveCamera, Vector3 } from 'three/webgpu'

/**
 * Orbit-style camera controller built for a 12-orders-of-magnitude zoom
 * range (interplanetary space down to comet nuclei).
 *
 * The controller always orbits the scene origin — the engine's floating
 * origin, i.e. the current focus point — so camera math stays in a small,
 * precision-safe numeric range no matter where in the system we are.
 *
 * Zoom is exponential (each wheel notch multiplies distance), all motion is
 * critically damped, and near/far planes are re-derived from the current
 * distance every frame.
 */

const MAX_DISTANCE = 30_000 // scene units (1 unit = 1e6 km)

export class CameraController {
  readonly camera: PerspectiveCamera

  // Spherical state (target values; actual values are damped toward them).
  private theta = 0.6
  private phi = 1.15
  private distance = 6000
  private targetTheta = this.theta
  private targetPhi = this.phi
  private targetLogDistance = Math.log(this.distance)

  /** Pan offset relative to the focus body, in scene units. */
  readonly panOffset = new Vector3()
  private minDistance = 1e-5
  /**
   * Distance from the camera to the nearest visible body SURFACE (scene
   * units), fed by the engine each frame. All motion is scaled by it so
   * skimming past a planet you are not focused on doesn't send the view
   * flying — without it, sensitivity follows the (possibly enormous)
   * distance to the focus point.
   */
  private proximity = Infinity

  // Fly-to animation for the distance channel.
  private flyFromLog = 0
  private flyToLog = 0
  private flyT = 1
  private flyDuration = 1

  private pointers = new Map<number, { x: number; y: number }>()
  private lastPinchDist: number | null = null
  private element: HTMLElement | null = null

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(50, aspect, 0.01, 100_000)
  }

  attach(element: HTMLElement): void {
    this.element = element
    element.addEventListener('pointerdown', this.onPointerDown)
    element.addEventListener('pointermove', this.onPointerMove)
    element.addEventListener('pointerup', this.onPointerUp)
    element.addEventListener('pointercancel', this.onPointerUp)
    element.addEventListener('wheel', this.onWheel, { passive: false })
    element.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  dispose(): void {
    const el = this.element
    if (!el) return
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointercancel', this.onPointerUp)
    el.removeEventListener('wheel', this.onWheel)
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** Smallest allowed distance (derived from the focus body's radius). */
  setMinDistance(value: number): void {
    this.minDistance = Math.max(value, 1e-6)
  }

  /** Camera distance to the nearest visible body surface (engine-fed). */
  setProximity(value: number): void {
    this.proximity = Math.max(value, 1e-7)
  }

  /** 1 in open space, → 0.05 while skimming a body's surface. */
  private motionScale(): number {
    if (!isFinite(this.proximity)) return 1
    return MathUtils.clamp((this.proximity * 3) / this.distance, 0.05, 1)
  }

  get currentDistance(): number {
    return this.distance
  }

  /** Animate distance to `dist` over `duration` seconds. */
  flyToDistance(dist: number, duration = 1.4): void {
    this.flyFromLog = Math.log(this.distance)
    this.flyToLog = Math.log(MathUtils.clamp(dist, this.minDistance, MAX_DISTANCE))
    this.flyT = 0
    this.flyDuration = duration
  }

  /** Instantly set distance (used on scale-mode switches). */
  snapToDistance(dist: number): void {
    this.distance = MathUtils.clamp(dist, this.minDistance, MAX_DISTANCE)
    this.targetLogDistance = Math.log(this.distance)
    this.flyT = 1
  }

  clearPan(): void {
    this.panOffset.set(0, 0, 0)
  }

  update(dt: number): void {
    // Fly-to animation drives the target distance while active.
    if (this.flyT < 1) {
      this.flyT = Math.min(1, this.flyT + dt / this.flyDuration)
      const e = easeInOutCubic(this.flyT)
      this.targetLogDistance = this.flyFromLog + (this.flyToLog - this.flyFromLog) * e
    }

    const minLog = Math.log(this.minDistance)
    const maxLog = Math.log(MAX_DISTANCE)
    this.targetLogDistance = MathUtils.clamp(this.targetLogDistance, minLog, maxLog)

    // Critically damped approach (frame-rate independent).
    const k = 1 - Math.exp(-dt * 10)
    this.theta += (this.targetTheta - this.theta) * k
    this.phi += (this.targetPhi - this.phi) * k
    const logDist = Math.log(this.distance) + (this.targetLogDistance - Math.log(this.distance)) * k
    this.distance = Math.exp(logDist)

    const sinPhi = Math.sin(this.phi)
    this.camera.position.set(
      this.panOffset.x + this.distance * sinPhi * Math.sin(this.theta),
      this.panOffset.y + this.distance * Math.cos(this.phi),
      this.panOffset.z + this.distance * sinPhi * Math.cos(this.theta),
    )
    this.camera.lookAt(this.panOffset)

    // Distance-adaptive clip planes: tight enough for a 2 km comet nucleus,
    // deep enough to keep the whole system + star sphere in view.
    this.camera.near = Math.max(this.distance * 2e-3, 1e-6)
    this.camera.far = Math.max(this.distance * 2e3, 90_000)
    this.camera.updateProjectionMatrix()
  }

  // ————— input handlers —————

  private onPointerDown = (e: PointerEvent): void => {
    this.element?.setPointerCapture(e.pointerId)
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.pointers.size === 2) this.lastPinchDist = this.pinchDistance()
  }

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId)
    if (!prev) return
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (this.pointers.size === 2) {
      // Pinch zoom + two-finger pan.
      const pinch = this.pinchDistance()
      if (this.lastPinchDist && pinch > 0) {
        let delta = Math.log(this.lastPinchDist / pinch)
        if (delta < 0) delta *= this.motionScale() // slow down zoom-in near surfaces
        this.targetLogDistance += delta
        this.flyT = 1
      }
      this.lastPinchDist = pinch
      this.pan(dx * 0.5, dy * 0.5)
      return
    }

    const rightButton = (e.buttons & 2) !== 0
    if (rightButton || e.shiftKey) {
      this.pan(dx, dy)
    } else {
      const h = this.element?.clientHeight ?? 800
      const speed = Math.PI * 1.1 * this.motionScale()
      this.targetTheta -= (dx / h) * speed
      this.targetPhi = MathUtils.clamp(this.targetPhi - (dy / h) * speed, 0.02, Math.PI - 0.02)
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size < 2) this.lastPinchDist = null
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const raw = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY
    // Clamp per-event delta (trackpad momentum can spike) and slow zoom-IN
    // near a surface; zoom-out always runs at full speed so you can't get
    // stuck crawling away from a planet.
    let delta = MathUtils.clamp(raw, -240, 240) * 0.0016
    if (delta < 0) delta *= this.motionScale()
    this.targetLogDistance += delta
    this.flyT = 1 // cancel any fly-to; the user took over
  }

  private pan(dxPx: number, dyPx: number): void {
    const h = this.element?.clientHeight ?? 800
    // Pan speed follows the nearest surface, not the (possibly distant) focus.
    const effectiveDist = Math.min(this.distance, this.proximity * 3)
    const worldPerPx =
      (2 * effectiveDist * Math.tan(MathUtils.degToRad(this.camera.fov / 2))) / h
    const right = new Vector3().setFromMatrixColumn(this.camera.matrix, 0)
    const up = new Vector3().setFromMatrixColumn(this.camera.matrix, 1)
    this.panOffset.addScaledVector(right, -dxPx * worldPerPx)
    this.panOffset.addScaledVector(up, dyPx * worldPerPx)
  }

  private pinchDistance(): number {
    const pts = [...this.pointers.values()]
    if (pts.length < 2) return 0
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
