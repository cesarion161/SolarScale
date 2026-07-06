import {
  engineCommand,
  paused,
  scaleMode,
  selectedObjectId,
  timeScale,
  visibility,
  type EngineCommand,
  type VisibilityCategory,
} from './stores'
import type { ScaleModeId } from '../simulation/scaleModes'

/**
 * Imperative actions over the shared stores. UI components call these; the
 * engine reacts through its subscriptions. Keeping mutations here (instead
 * of scattered store.set calls) gives one place to add validation, undo,
 * analytics or persistence later.
 */

let commandSeq = 0

export function selectObject(id: string | null): void {
  selectedObjectId.set(id)
}

export function setScaleMode(mode: ScaleModeId): void {
  scaleMode.set(mode)
}

export function toggleCategory(category: VisibilityCategory): void {
  visibility.update((v) => ({ ...v, [category]: !v[category] }))
}

export function setTimeScale(value: number): void {
  timeScale.set(value)
}

export function togglePaused(): void {
  paused.update((p) => !p)
}

export function sendEngineCommand(command: EngineCommand): void {
  engineCommand.set({ seq: ++commandSeq, command })
}

export function emitLightPulse(): void {
  // Fires exactly one pulse; deliberately does NOT enable the auto-pulse
  // toggle — that switch governs automatic pulsation only.
  sendEngineCommand({ kind: 'emitLightPulse' })
}

export function clearLightPulses(): void {
  sendEngineCommand({ kind: 'clearLightPulses' })
}

export function resetView(): void {
  selectedObjectId.set(null)
  sendEngineCommand({ kind: 'resetView' })
}
