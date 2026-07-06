import type { RuntimeBody } from './bodies'

/**
 * Screen-space labels drawn on a single 2D canvas overlay.
 *
 * This deliberately avoids DOM/Svelte labels: one canvas, one clear, a few
 * dozen fillText calls per frame — no reactivity, no layout, no GC churn.
 *
 * Labels are priority-ranked (Sun → planets → dwarfs → comets → asteroids →
 * moons) and rectangle-packed: a lower-priority label that would overlap an
 * already-drawn one is skipped. Sub-pixel bodies get a coloured "presence
 * dot" so true-scale mode stays navigable. The same book-keeping powers
 * click picking.
 */

interface DrawnEntry {
  body: RuntimeBody
  x: number
  y: number
}

const CATEGORY_PRIORITY: Record<string, number> = {
  star: 0,
  planet: 1,
  dwarfPlanet: 2,
  comet: 3,
  asteroid: 4,
  moon: 5,
}

const MAX_LABELS = 48

export class LabelRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private drawn: DrawnEntry[] = []
  private dpr = 1

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'label-overlay'
    Object.assign(this.canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    })
    container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')!
  }

  resize(width: number, height: number, dpr: number): void {
    this.dpr = dpr
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
  }

  /**
   * @param bodies bodies with fresh screen-space state (parent-first order)
   * @param selectedId id of the selected body (gets a marker + guaranteed label)
   * @param showLabels master toggle — dots and selection marker still draw
   * @param showDots presence dots for sub-pixel bodies; disabled in true
   *   scale, where a dot would be far larger than the body it stands for
   */
  draw(
    bodies: RuntimeBody[],
    selectedId: string | null,
    showLabels: boolean,
    showDots: boolean,
  ): void {
    const ctx = this.ctx
    const dpr = this.dpr
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.drawn = []

    const candidates = bodies
      .filter((b) => b.visibleNow && b.onScreen)
      .sort(
        (a, b) =>
          (CATEGORY_PRIORITY[a.category] ?? 9) - (CATEGORY_PRIORITY[b.category] ?? 9) ||
          b.projectedRadiusPx - a.projectedRadiusPx,
      )

    const usedRects: { x: number; y: number; w: number; h: number }[] = []
    ctx.font = `${11 * dpr}px system-ui, -apple-system, sans-serif`
    ctx.textBaseline = 'middle'

    let labelCount = 0
    for (const body of candidates) {
      const x = body.screenX * dpr
      const y = body.screenY * dpr
      const isSelected = body.id === selectedId

      // Moons: only label once visually separated from their parent.
      if (body.category === 'moon' && body.parent && !isSelected) {
        const sep = Math.hypot(
          body.screenX - body.parent.screenX,
          body.screenY - body.parent.screenY,
        )
        if (sep < 16) continue
      }

      // Presence dot for sub-pixel bodies.
      if (showDots && body.projectedRadiusPx < 1.5) {
        const dotR = (body.category === 'planet' || body.category === 'star' ? 2.4 : 1.7) * dpr
        ctx.beginPath()
        ctx.arc(x, y, dotR, 0, Math.PI * 2)
        ctx.fillStyle = body.color
        ctx.fill()
      }

      this.drawn.push({ body, x: body.screenX, y: body.screenY })

      if (isSelected) this.drawSelectionMarker(x, y, body)
      if (!showLabels && !isSelected) continue
      if (labelCount >= MAX_LABELS) continue

      const text = body.name
      const metrics = ctx.measureText(text)
      const pad = 3 * dpr
      const offset = Math.max(body.projectedRadiusPx * dpr, 4 * dpr) + 6 * dpr
      const rect = {
        x: x + offset - pad,
        y: y - 8 * dpr,
        w: metrics.width + pad * 2,
        h: 16 * dpr,
      }
      if (!isSelected && usedRects.some((r) => intersects(r, rect))) continue
      usedRects.push(rect)
      labelCount++

      ctx.fillStyle = 'rgba(2,6,14,0.55)'
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      ctx.fillStyle = isSelected ? '#9ecbff' : 'rgba(235,240,250,0.88)'
      ctx.fillText(text, x + offset, y)
    }
  }

  private drawSelectionMarker(x: number, y: number, body: RuntimeBody): void {
    const ctx = this.ctx
    const r = Math.max(body.projectedRadiusPx * this.dpr * 1.35, 12 * this.dpr)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(130,190,255,0.85)'
    ctx.lineWidth = 1.5 * this.dpr
    ctx.stroke()
  }

  /** Nearest pickable body within `radiusPx` of a CSS-pixel screen point. */
  pick(xCss: number, yCss: number, radiusPx = 16): RuntimeBody | null {
    let best: RuntimeBody | null = null
    let bestDist = radiusPx
    for (const entry of this.drawn) {
      const d = Math.hypot(entry.x - xCss, entry.y - yCss)
      const reach = Math.max(bestDist, entry.body.projectedRadiusPx)
      if (d < reach && (best === null || d < bestDist)) {
        best = entry.body
        bestDist = d
      }
    }
    return best
  }

  dispose(): void {
    this.canvas.remove()
  }
}

function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
