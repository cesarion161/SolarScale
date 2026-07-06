import type {
  AsteroidFieldChunk,
  AsteroidLoadOptions,
  CometData,
  MoonData,
  NamedAsteroidData,
  OrbitPathChunk,
  OrbitPathOptions,
  PlanetData,
  SolarSystemMeta,
} from './types'

/**
 * Abstraction over the source of astronomical data.
 *
 * The rendering and simulation layers depend only on this interface, so the
 * static-asset MVP provider can later be replaced (or supplemented) by an
 * `ApiDataProvider` backed by a runtime service without touching the engine.
 */
export interface SolarSystemDataProvider {
  loadMeta(): Promise<SolarSystemMeta>
  loadPlanets(): Promise<PlanetData[]>
  loadMoons(): Promise<MoonData[]>
  loadAsteroids(options?: AsteroidLoadOptions): Promise<AsteroidFieldChunk>
  loadNamedAsteroids(): Promise<NamedAsteroidData[]>
  loadComets(): Promise<CometData[]>
  loadOrbitPaths(options?: OrbitPathOptions): Promise<OrbitPathChunk>
}
