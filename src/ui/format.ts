import { AU_KM } from '../simulation/scaleModes'

/** Human-friendly formatting for astronomical quantities (UI layer only). */

export function formatKm(km: number): string {
  if (km >= 1e9) return `${(km / 1e9).toFixed(2)} billion km`
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)} million km`
  if (km >= 1e4) return `${Math.round(km).toLocaleString('en-US')} km`
  return `${km.toFixed(0)} km`
}

export function formatAu(km: number): string {
  const au = km / AU_KM
  if (au < 0.01) return `${(au * 1000).toFixed(2)} mAU`
  return `${au.toFixed(au < 1 ? 3 : 2)} AU`
}

export function formatDuration(totalSec: number): string {
  if (!isFinite(totalSec)) return '—'
  if (totalSec < 60) return `${totalSec.toFixed(totalSec < 10 ? 1 : 0)} s`
  const min = totalSec / 60
  if (min < 60) return `${Math.floor(min)} min ${Math.round(totalSec % 60)} s`
  const hr = totalSec / 3600
  if (hr < 48) return `${Math.floor(hr)} h ${Math.round(min % 60)} min`
  const days = totalSec / 86_400
  if (days < 400) return `${days.toFixed(1)} days`
  return `${(days / 365.25).toFixed(1)} years`
}

export function formatPeriod(sec: number | undefined): string {
  if (sec === undefined) return '—'
  const abs = Math.abs(sec)
  const retro = sec < 0 ? ' (retrograde)' : ''
  return formatDuration(abs) + retro
}

export function formatMass(kg: number | undefined): string {
  if (kg === undefined) return '—'
  const exp = Math.floor(Math.log10(kg))
  const mantissa = kg / 10 ** exp
  return `${mantissa.toFixed(2)}×10${superscript(exp)} kg`
}

export function formatDegrees(rad: number | undefined): string {
  if (rad === undefined) return '—'
  return `${((rad * 180) / Math.PI).toFixed(1)}°`
}

export function formatSimDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
}

function superscript(n: number): string {
  return String(n).split('').map((c) => SUPERSCRIPTS[c] ?? c).join('')
}

export const CATEGORY_LABELS: Record<string, string> = {
  star: 'Star',
  planet: 'Planet',
  dwarfPlanet: 'Dwarf planet',
  moon: 'Moon',
  asteroid: 'Asteroid',
  comet: 'Comet',
}
