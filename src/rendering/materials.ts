import {
  CanvasTexture,
  Color,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Texture,
} from 'three/webgpu'
import type { BodyCommon, SurfaceKind } from '../data/types'

/**
 * Procedural material factory.
 *
 * The MVP ships no texture downloads: every surface is generated once at
 * startup from seeded noise (deterministic across reloads) and cached by
 * surface-kind + colour. `/public/textures` stays reserved for real imagery
 * later — swapping these generators for file loads is a one-function change.
 */

// ————— seeded noise —————

// Murmur3-style finalizer with unsigned shifts. (An earlier version used
// signed shifts, which skewed outputs toward 0 — fbm topped out near 0.42
// and threshold-based features like Earth's continents never appeared.)
function hash2(ix: number, iy: number, seed: number): number {
  let h =
    (Math.imul(ix, 0x27d4eb2d) + Math.imul(iy, 0x165667b1) + Math.imul(seed, 0x9e3779b9)) | 0
  h = (h ^ (h >>> 15)) | 0
  h = Math.imul(h, 0x85ebca6b)
  h = (h ^ (h >>> 13)) | 0
  h = Math.imul(h, 0xc2b2ae35)
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967295
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Value noise, tileable in x with the given integer period. */
function noise2(x: number, y: number, periodX: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const x0 = ((ix % periodX) + periodX) % periodX
  const x1 = (x0 + 1) % periodX
  const a = hash2(x0, iy, seed)
  const b = hash2(x1, iy, seed)
  const c = hash2(x0, iy + 1, seed)
  const d = hash2(x1, iy + 1, seed)
  const sx = smooth(fx)
  const sy = smooth(fy)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** Fractal Brownian motion, tileable in x. */
function fbm(u: number, v: number, octaves: number, scale: number, seed: number): number {
  let sum = 0
  let amp = 0.5
  let freq = scale
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(u * freq, v * freq, Math.max(1, Math.round(freq)), seed + o * 101)
    amp *= 0.5
    freq *= 2
  }
  return sum
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ————— texture synthesis —————

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const c = new Color(hex)
  return [c.r * 255, c.g * 255, c.b * 255]
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function paintTexture(
  width: number,
  height: number,
  shade: (u: number, v: number) => RGB,
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(width, height)
  const data = img.data
  for (let y = 0; y < height; y++) {
    const v = y / height
    for (let x = 0; x < width; x++) {
      const [r, g, b] = shade(x / width, v)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  return texture
}

function stampCraters(texture: CanvasTexture, count: number, seed: number): void {
  const canvas = texture.image as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  const rand = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    const cx = rand() * canvas.width
    const cy = canvas.height * (0.1 + rand() * 0.8)
    const r = 1.5 + rand() * rand() * 10
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0,0,0,${0.10 + rand() * 0.15})`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,255,255,${0.08 + rand() * 0.1})`
    ctx.lineWidth = Math.max(0.6, r * 0.15)
    ctx.stroke()
  }
  texture.needsUpdate = true
}

const GAS_PALETTES: Record<string, string[]> = {
  jupiter: ['#b88d5f', '#e5d4b5', '#96674a', '#e0c095', '#7d5a41', '#ecdfc6', '#c49a6c'],
  saturn: ['#e6d4a8', '#d3b984', '#c7a86e', '#eadcb4', '#bfa06a'],
  default: ['#c8b090', '#e0d0b0', '#a89070'],
}

function surfaceTexture(kind: SurfaceKind, baseColor: string, bodyId: string): CanvasTexture {
  const base = hexToRgb(baseColor)
  const seed = [...bodyId].reduce((s, c) => s + c.charCodeAt(0) * 7, 3)

  switch (kind) {
    case 'sun':
      return paintTexture(512, 256, (u, v) => {
        const g = fbm(u, v, 4, 24, seed)
        const t = 0.72 + g * 0.5
        return lerpRgb([255, 140, 30], [255, 244, 210], Math.min(1, t))
      })

    case 'cratered': {
      const tex = paintTexture(512, 256, (u, v) => {
        const g = 0.75 + fbm(u, v, 5, 6, seed) * 0.55
        return [base[0] * g, base[1] * g, base[2] * g]
      })
      stampCraters(tex, 140, seed)
      return tex
    }

    case 'rockyDark': {
      const tex = paintTexture(256, 128, (u, v) => {
        const g = 0.6 + fbm(u, v, 4, 8, seed) * 0.7
        return [base[0] * g, base[1] * g, base[2] * g]
      })
      stampCraters(tex, 40, seed)
      return tex
    }

    case 'venusian':
      return paintTexture(512, 256, (u, v) => {
        const swirl = fbm(u + fbm(u, v, 2, 3, seed + 7) * 0.15, v * 2.4, 4, 4, seed)
        return lerpRgb(base, [252, 244, 216], swirl * 0.9)
      })

    case 'earthlike':
      return paintTexture(2048, 1024, (u, v) => {
        const lat = Math.abs(v - 0.5) * 2
        const continents = fbm(u, v * 2, 6, 3.2, seed)
        const detail = fbm(u, v * 2, 5, 14, seed + 31)
        let rgb: RGB
        if (continents > 0.545) {
          // Land: green equatorial belts fading to tan interiors and poles.
          const interior = Math.min(1, (continents - 0.545) * 9)
          const lush = Math.max(0.1, 1 - lat * 1.15) * (0.55 + detail * 0.65)
          rgb = lerpRgb([176, 152, 96], [38, 118, 48], Math.min(1, lush))
          // Sandy coastline strip right at the land/ocean boundary.
          rgb = lerpRgb([204, 186, 138], rgb, Math.min(1, interior + 0.2))
        } else {
          // Ocean: bright shelf water dropping to deep blue.
          const depth = Math.min(1, (0.545 - continents) * 7)
          rgb = lerpRgb([64, 138, 186], [14, 52, 110], Math.pow(depth, 0.7))
        }
        if (lat > 0.86) rgb = lerpRgb(rgb, [242, 248, 252], Math.min(1, (lat - 0.86) * 10))
        const cloud = fbm(u * 1.6 + 40, v * 3.2, 4, 5, seed + 77)
        if (cloud > 0.56) rgb = lerpRgb(rgb, [255, 255, 255], Math.min(0.8, (cloud - 0.56) * 4.5))
        return rgb
      })

    case 'martian':
      return paintTexture(512, 256, (u, v) => {
        const lat = Math.abs(v - 0.5) * 2
        const g = 0.7 + fbm(u, v * 2, 5, 5, seed) * 0.6
        let rgb: RGB = [base[0] * g, base[1] * g, base[2] * g]
        const dark = fbm(u, v * 2, 3, 2.5, seed + 13)
        if (dark > 0.6) rgb = lerpRgb(rgb, [70, 45, 32], Math.min(0.6, (dark - 0.6) * 3))
        if (lat > 0.88) rgb = lerpRgb(rgb, [244, 240, 234], Math.min(1, (lat - 0.88) * 10))
        return rgb
      })

    case 'gasBands': {
      const palette = (GAS_PALETTES[bodyId] ?? GAS_PALETTES.default).map(hexToRgb)
      return paintTexture(1024, 512, (u, v) => {
        const distort = (fbm(u, v * 3, 4, 6, seed) - 0.5) * 0.08
        const band = (v + distort) * palette.length * 1.6
        const i0 = ((Math.floor(band) % palette.length) + palette.length) % palette.length
        const i1 = (i0 + 1) % palette.length
        let rgb = lerpRgb(palette[i0], palette[i1], smooth(band - Math.floor(band)))
        if (bodyId === 'jupiter') {
          // Great Red Spot
          const du = (u - 0.68) * 2.6
          const dv = (v - 0.64) * 6
          const d = du * du + dv * dv
          if (d < 1) rgb = lerpRgb(rgb, [176, 78, 52], (1 - d) * 0.85)
        }
        return rgb
      })
    }

    case 'iceGiant':
      return paintTexture(512, 256, (u, v) => {
        const band = fbm(u * 0.5, v * 4, 3, 3, seed) * 0.25
        const g = 0.9 + band
        let rgb: RGB = [base[0] * g, base[1] * g, base[2] * g]
        if (bodyId === 'neptune') {
          const du = (u - 0.35) * 3.5
          const dv = (v - 0.42) * 7
          const d = du * du + dv * dv
          if (d < 1) rgb = lerpRgb(rgb, [22, 44, 110], (1 - d) * 0.7)
        }
        return rgb
      })

    case 'icy':
      return paintTexture(512, 256, (u, v) => {
        const g = 0.82 + fbm(u, v, 4, 7, seed) * 0.35
        const cracks = fbm(u * 3, v * 0.8, 5, 9, seed + 5)
        let rgb: RGB = [base[0] * g, base[1] * g, base[2] * g]
        if (cracks > 0.62) rgb = lerpRgb(rgb, [base[0] * 0.5, base[1] * 0.45, base[2] * 0.5], 0.5)
        return rgb
      })
  }
}

// ————— public factory —————

const textureCache = new Map<string, CanvasTexture>()

export function getBodyTexture(body: Pick<BodyCommon, 'id' | 'color' | 'surface'>): CanvasTexture {
  // Moons of the same archetype+colour share one texture.
  const key =
    body.surface === 'gasBands' || body.surface === 'earthlike' || body.surface === 'iceGiant'
      ? `${body.surface}:${body.id}`
      : `${body.surface}:${body.color}`
  let tex = textureCache.get(key)
  if (!tex) {
    tex = surfaceTexture(body.surface, body.color, body.id)
    textureCache.set(key, tex)
  }
  return tex
}

export function createBodyMaterial(body: Pick<BodyCommon, 'id' | 'color' | 'surface'>): Material {
  const map = getBodyTexture(body)
  if (body.surface === 'sun') {
    return new MeshBasicMaterial({ map })
  }
  return new MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 })
}

/** Saturn-style ring texture: 1-D radial strip (u = radial fraction). */
export function createRingTexture(seed = 42): CanvasTexture {
  const rand = mulberry32(seed)
  return paintTexture(512, 4, (u) => {
    void rand
    const bands = fbm(u * 8, 0.5, 4, 6, seed)
    let alpha = 0.35 + bands * 0.65
    if (u > 0.58 && u < 0.66) alpha *= 0.15 // Cassini division
    if (u < 0.05) alpha *= u / 0.05
    if (u > 0.95) alpha *= (1 - u) / 0.05
    const tone = 200 + bands * 55
    return [tone * alpha, tone * 0.93 * alpha, tone * 0.8 * alpha]
  })
}

/** Soft radial glow sprite texture (sun halo, comet comas). */
export function createGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,200,80,0)'): Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, inner)
  grad.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.5)'))
  grad.addColorStop(1, outer)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/** Equirectangular star-sky texture for the background sphere. */
export function createStarfieldTexture(): CanvasTexture {
  const w = 4096
  const h = 2048
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#020308'
  ctx.fillRect(0, 0, w, h)

  // Faint Milky-Way band along the texture equator (the mesh is tilted).
  const rand = mulberry32(20260706)
  for (let i = 0; i < 1400; i++) {
    const x = rand() * w
    const y = h / 2 + (rand() + rand() + rand() - 1.5) * h * 0.08
    const r = 30 + rand() * 90
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(160,175,205,${0.004 + rand() * 0.008})`)
    g.addColorStop(1, 'rgba(160,175,205,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Stars, denser toward the band, sine-corrected for equirect projection.
  for (let i = 0; i < 11000; i++) {
    const u = rand()
    const v = Math.acos(1 - 2 * rand()) / Math.PI
    const nearBand = Math.exp(-Math.pow((v - 0.5) / 0.16, 2))
    if (rand() > 0.45 + nearBand * 0.55) continue
    const x = u * w
    const y = v * h
    const mag = Math.pow(rand(), 3)
    const size = 0.35 + mag * 1.1
    const warm = rand()
    const cr = 200 + warm * 55
    const cg = 205 + rand() * 40
    const cb = 215 + (1 - warm) * 40
    ctx.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${0.25 + mag * 0.75})`
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}
