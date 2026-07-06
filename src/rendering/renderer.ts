import { WebGPURenderer } from 'three/webgpu'

/**
 * WebGPU renderer bootstrap.
 *
 * WebGPU is the ONLY supported backend in the MVP (no WebGL2 fallback by
 * design). We probe for a real adapter before constructing the renderer so
 * unsupported browsers get a clean, early error the UI can present.
 */

export class WebGPUUnsupportedError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'WebGPUUnsupportedError'
  }
}

export async function assertWebGPUSupport(): Promise<void> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    throw new WebGPUUnsupportedError('This browser does not expose the WebGPU API.')
  }
  const adapter = await navigator.gpu.requestAdapter().catch(() => null)
  if (!adapter) {
    throw new WebGPUUnsupportedError('WebGPU is present but no GPU adapter is available.')
  }
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  await assertWebGPUSupport()
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    // Never silently fall back to WebGL — the MVP is WebGPU-only.
    forceWebGL: false,
  })
  await renderer.init()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  return renderer
}
