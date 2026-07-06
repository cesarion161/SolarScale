import type { SolarSystemDataProvider } from './SolarSystemDataProvider'
import type {
  AsteroidFieldChunk,
  AsteroidGroup,
  AsteroidLoadOptions,
  CometData,
  MoonData,
  NamedAsteroidData,
  OrbitPathChunk,
  OrbitPathOptions,
  PlanetData,
  SolarSystemMeta,
} from './types'
import {
  decodeBinaryAsset,
  type AsteroidBinHeader,
  type OrbitPathBinHeader,
} from './binaryLoaders'

/**
 * MVP data provider: loads pre-generated static JSON/binary assets from
 * `/public/data` (produced by `npm run generate-data`).
 *
 * Responses are cached, so repeated calls are cheap and the engine can ask
 * for data lazily per subsystem.
 */
export class StaticAssetDataProvider implements SolarSystemDataProvider {
  private readonly baseUrl: string
  private readonly cache = new Map<string, Promise<unknown>>()

  constructor(baseUrl = '/data') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  loadMeta(): Promise<SolarSystemMeta> {
    return this.json<SolarSystemMeta>('solar-system.meta.json')
  }

  loadPlanets(): Promise<PlanetData[]> {
    return this.json<PlanetData[]>('planets.v1.json')
  }

  loadMoons(): Promise<MoonData[]> {
    return this.json<MoonData[]>('moons.v1.json')
  }

  loadComets(): Promise<CometData[]> {
    return this.json<CometData[]>('comets.v1.json')
  }

  loadNamedAsteroids(): Promise<NamedAsteroidData[]> {
    return this.json<NamedAsteroidData[]>('asteroids-named.v1.json')
  }

  async loadAsteroids(options?: AsteroidLoadOptions): Promise<AsteroidFieldChunk> {
    const buffer = await this.binary('asteroids.v1.bin')
    const { header, payload } = decodeBinaryAsset<AsteroidBinHeader>(buffer)
    const stride = header.stride
    const groupIndexToName = new Map(header.groups.map((g) => [g.index, g.name as AsteroidGroup]))

    const wanted = options?.groups ? new Set(options.groups) : null
    const maxCount = options?.maxCount ?? Infinity

    const groupCounts: Record<AsteroidGroup, number> = {
      mainBelt: 0,
      trojans: 0,
      kuiperBelt: 0,
    }

    // Fast path: everything requested and no cap.
    if (!wanted && header.count <= maxCount) {
      for (const g of header.groups) groupCounts[g.name as AsteroidGroup] = g.count
      return { count: header.count, stride, records: payload, groupCounts }
    }

    const out = new Float32Array(Math.min(header.count, maxCount) * stride)
    let kept = 0
    for (let i = 0; i < header.count && kept < maxCount; i++) {
      const group = groupIndexToName.get(payload[i * stride + 7])
      if (!group || (wanted && !wanted.has(group))) continue
      out.set(payload.subarray(i * stride, (i + 1) * stride), kept * stride)
      groupCounts[group]++
      kept++
    }
    return { count: kept, stride, records: out.subarray(0, kept * stride), groupCounts }
  }

  async loadOrbitPaths(options?: OrbitPathOptions): Promise<OrbitPathChunk> {
    const buffer = await this.binary('orbit-paths.v1.bin')
    const { header, payload } = decodeBinaryAsset<OrbitPathBinHeader>(buffer)
    const wanted = options?.bodyIds ? new Set(options.bodyIds) : null
    const entries = header.entries
      .filter((e) => !wanted || wanted.has(e.bodyId))
      .map((e) => ({
        bodyId: e.bodyId,
        positionsKm: payload.subarray(e.offsetFloats, e.offsetFloats + e.pointCount * 3),
      }))
    return { entries }
  }

  private json<T>(file: string): Promise<T> {
    return this.cached(file, async () => {
      const res = await fetch(`${this.baseUrl}/${file}`)
      if (!res.ok) throw new Error(`Failed to load ${file}: HTTP ${res.status}`)
      return (await res.json()) as T
    })
  }

  private binary(file: string): Promise<ArrayBuffer> {
    return this.cached(file, async () => {
      const res = await fetch(`${this.baseUrl}/${file}`)
      if (!res.ok) throw new Error(`Failed to load ${file}: HTTP ${res.status}`)
      return res.arrayBuffer()
    })
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    let entry = this.cache.get(key)
    if (!entry) {
      entry = load()
      this.cache.set(key, entry)
    }
    return entry as Promise<T>
  }
}
