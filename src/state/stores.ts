import { writable, type Writable } from 'svelte/store'
import type { ScaleModeId } from '../simulation/scaleModes'
import type { BodyCategory } from '../data/types'

/**
 * High-level application state shared between the Svelte UI shell and the
 * rendering/simulation engine.
 *
 * Rules of engagement (see project architecture notes):
 *  - Only coarse, low-frequency state lives here (selection, modes, toggles).
 *  - The engine SUBSCRIBES to these stores; per-frame values never flow
 *    through Svelte reactivity. Engine → UI feedback (sim clock readout,
 *    light HUD) is pushed at a throttled, human-readable rate.
 */

export type VisibilityCategory =
  | 'planets'
  | 'dwarfPlanets'
  | 'moons'
  | 'asteroids'
  | 'comets'
  | 'labels'
  | 'orbits'
  | 'lightTravel'

export type VisibilityState = Record<VisibilityCategory, boolean>

/** Simulation speed presets, in simulated-seconds per real-second. */
export const TIME_SCALE_PRESETS: { label: string; value: number; hint: string }[] = [
  { label: '1×', value: 1, hint: 'Real time' },
  { label: '2×', value: 2, hint: 'Twice real time' },
  { label: '4×', value: 4, hint: '4× real time' },
  { label: '8×', value: 8, hint: '8× real time' },
  { label: '60×', value: 60, hint: '1 min per second — watch sunlight travel' },
  { label: '1 h/s', value: 3600, hint: '1 hour per second — see planets spin' },
  { label: '1 d/s', value: 86_400, hint: '1 day per second — inner planets orbit' },
  { label: '1 w/s', value: 604_800, hint: '1 week per second' },
  { label: '1 mo/s', value: 2_592_000, hint: '1 month per second — outer planets crawl' },
]

/** Lightweight catalogue entry the UI needs for search and the info panel. */
export interface BodySummary {
  id: string
  name: string
  category: BodyCategory
  parentId?: string
  radiusKm: number
  massKg?: number
  orbitPeriodSec?: number
  rotationPeriodSec?: number
  axialTiltRad?: number
  semiMajorAxisKm?: number
  color: string
  description: string
  facts?: string[]
}

/** Engine → UI: live readouts pushed at a throttled rate (a few Hz). */
export interface LiveReadout {
  simDateIso: string
  /** Selected body's current distance from the Sun, km (null = none/Sun). */
  selectedSunDistanceKm: number | null
  /**
   * Camera distance to the selected body's surface, km (null = no selection).
   * Exact in distance-real scale modes; in compressed modes it is the
   * display-space distance converted at 1 unit = 1e6 km.
   */
  selectedCameraDistanceKm: number | null
  /** Camera distance to its focus target, km. */
  cameraDistanceKm: number
  /** Real km spanned by one screen pixel at the focus distance. */
  kmPerPixel: number
  /** Age of the newest light pulse in simulated seconds (null = no pulse). */
  lightPulseAgeSec: number | null
  /** Per-planet light arrival status for the newest pulse. */
  lightArrivals: { id: string; name: string; travelTimeSec: number; reached: boolean }[]
}

// ————— UI → engine —————
export const selectedObjectId: Writable<string | null> = writable(null)
export const scaleMode: Writable<ScaleModeId> = writable('exaggerated')
export const visibility: Writable<VisibilityState> = writable({
  planets: true,
  dwarfPlanets: true,
  moons: true,
  asteroids: true,
  comets: true,
  labels: true,
  orbits: true,
  lightTravel: false,
})
export const timeScale: Writable<number> = writable(86_400)
export const paused: Writable<boolean> = writable(false)

/** One-shot commands from UI to engine (sequence number forces re-fire). */
export type EngineCommand =
  | { kind: 'emitLightPulse' }
  | { kind: 'clearLightPulses' }
  | { kind: 'resetView' }
export const engineCommand: Writable<{ seq: number; command: EngineCommand } | null> =
  writable(null)

// ————— engine → UI —————
export const bodyCatalog: Writable<BodySummary[]> = writable([])
export const liveReadout: Writable<LiveReadout> = writable({
  simDateIso: '',
  selectedSunDistanceKm: null,
  selectedCameraDistanceKm: null,
  cameraDistanceKm: 0,
  kmPerPixel: 0,
  lightPulseAgeSec: null,
  lightArrivals: [],
})
export const engineStatus: Writable<'booting' | 'loading' | 'ready' | 'unsupported' | 'error'> =
  writable('booting')
export const engineErrorMessage: Writable<string> = writable('')
