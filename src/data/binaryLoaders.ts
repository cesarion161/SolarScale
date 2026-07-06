/**
 * Readers for SolarScale binary assets (`.bin`).
 *
 * Format "SSB1" (see tools/generate-data.ts for the writer):
 *   bytes 0..3   magic "SSB1"
 *   bytes 4..7   uint32 LE: header JSON byte length (padded to 4-byte multiple)
 *   bytes 8..    header JSON (utf-8, space padded)
 *   then         Float32Array payload (little-endian)
 */

const MAGIC = 'SSB1'

export interface BinaryAsset<H> {
  header: H
  payload: Float32Array
}

export function decodeBinaryAsset<H>(buffer: ArrayBuffer): BinaryAsset<H> {
  const view = new DataView(buffer)
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  )
  if (magic !== MAGIC) {
    throw new Error(`Invalid binary asset: expected magic "${MAGIC}", got "${magic}"`)
  }
  const headerLength = view.getUint32(4, true)
  const headerBytes = new Uint8Array(buffer, 8, headerLength)
  const header = JSON.parse(new TextDecoder().decode(headerBytes)) as H
  const payloadOffset = 8 + headerLength
  const payload = new Float32Array(buffer, payloadOffset)
  return { header, payload }
}

/** Header of asteroids.v1.bin. */
export interface AsteroidBinHeader {
  kind: 'asteroid-field'
  count: number
  stride: number
  fields: string[]
  groups: { name: string; index: number; count: number }[]
}

/** Header of orbit-paths.v1.bin. */
export interface OrbitPathBinHeader {
  kind: 'orbit-paths'
  entries: { bodyId: string; offsetFloats: number; pointCount: number }[]
}
