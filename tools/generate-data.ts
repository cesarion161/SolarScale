/**
 * Offline preprocessing pipeline.
 *
 * Reads human-maintained astronomy tables from ./source-data (AU, degrees,
 * days — units people actually write), normalizes them to the runtime
 * conventions (km, seconds, radians, J2000), and emits the optimized static
 * assets served from /public/data:
 *
 *   solar-system.meta.json   manifest + counts
 *   planets.v1.json          sun + planets + dwarf planets
 *   moons.v1.json            major moons
 *   comets.v1.json           famous comets
 *   asteroids-named.v1.json  selected large asteroids
 *   asteroids.v1.bin         dense asteroid field (Float32 records)
 *   orbit-paths.v1.bin       pre-sampled heliocentric orbit polylines
 *
 * Run with: npm run generate-data
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sampleOrbitPath } from '../src/simulation/orbitalMotion'
import type {
  CometData,
  MoonData,
  NamedAsteroidData,
  OrbitalElements,
  PlanetData,
  SolarSystemMeta,
  SurfaceKind,
} from '../src/data/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = join(HERE, 'source-data')
const OUT_DIR = join(HERE, '..', 'public', 'data')

const DEG = Math.PI / 180
const AU_KM = 149_597_870.7
const DAY_SEC = 86_400
const HOUR_SEC = 3_600
const YEAR_SEC = 365.25 * DAY_SEC

// ————— raw source shapes —————

interface RawOrbit {
  aAu: number
  e: number
  iDeg: number
  nodeDeg: number
  periDeg: number
  m0Deg: number
  periodDays: number
}

interface RawPlanet {
  id: string
  name: string
  category: 'star' | 'planet' | 'dwarfPlanet'
  radiusKm: number
  massKg?: number
  color: string
  surface: SurfaceKind
  rotationHours: number
  axialTiltDeg: number
  rings?: { innerRadiusFactor: number; outerRadiusFactor: number }
  orbit?: RawOrbit
  description: string
  facts?: string[]
}

interface RawMoon {
  id: string
  name: string
  parentId: string
  radiusKm: number
  massKg?: number
  color: string
  surface: SurfaceKind
  aKm: number
  e: number
  iDeg: number
  periodDays: number
  description: string
  facts?: string[]
}

interface RawComet {
  id: string
  name: string
  radiusKm: number
  massKg?: number
  color: string
  surface: SurfaceKind
  aAu: number
  e: number
  iDeg: number
  nodeDeg: number
  periDeg: number
  m0Deg: number
  periodYears?: number
  periodDays?: number
  description: string
  facts?: string[]
}

function readSource<T>(file: string): T {
  return JSON.parse(readFileSync(join(SOURCE_DIR, file), 'utf-8')) as T
}

// ————— unit conversion —————

function convertOrbit(raw: RawOrbit): OrbitalElements {
  return {
    semiMajorAxisKm: raw.aAu * AU_KM,
    eccentricity: raw.e,
    inclinationRad: raw.iDeg * DEG,
    ascendingNodeRad: raw.nodeDeg * DEG,
    argPeriapsisRad: raw.periDeg * DEG,
    meanAnomalyAtEpochRad: raw.m0Deg * DEG,
    periodSec: raw.periodDays * DAY_SEC,
  }
}

function convertPlanet(raw: RawPlanet): PlanetData {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    physical: { radiusKm: raw.radiusKm, massKg: raw.massKg },
    color: raw.color,
    surface: raw.surface,
    rotation: {
      periodSec: raw.rotationHours * HOUR_SEC,
      axialTiltRad: raw.axialTiltDeg * DEG,
    },
    rings: raw.rings,
    orbit: raw.orbit ? convertOrbit(raw.orbit) : undefined,
    description: raw.description,
    facts: raw.facts,
  }
}

/** Deterministic pseudo-angle so moons don't all start aligned. */
function seededAngle(id: string, salt: number): number {
  let h = salt
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0
  return ((h >>> 0) % 3600) * 0.1 * DEG
}

function convertMoon(raw: RawMoon): MoonData {
  return {
    id: raw.id,
    name: raw.name,
    category: 'moon',
    parentId: raw.parentId,
    physical: { radiusKm: raw.radiusKm, massKg: raw.massKg },
    color: raw.color,
    surface: raw.surface,
    orbit: {
      semiMajorAxisKm: raw.aKm,
      eccentricity: raw.e,
      inclinationRad: raw.iDeg * DEG,
      ascendingNodeRad: seededAngle(raw.id, 17),
      argPeriapsisRad: seededAngle(raw.id, 101),
      meanAnomalyAtEpochRad: seededAngle(raw.id, 53),
      periodSec: raw.periodDays * DAY_SEC,
    },
    // Major moons are tidally locked: spin period = orbital period.
    rotation: { periodSec: raw.periodDays * DAY_SEC, axialTiltRad: 0 },
    description: raw.description,
    facts: raw.facts,
  }
}

function convertComet(raw: RawComet): CometData {
  const periodSec = raw.periodYears ? raw.periodYears * YEAR_SEC : raw.periodDays! * DAY_SEC
  return {
    id: raw.id,
    name: raw.name,
    category: 'comet',
    physical: { radiusKm: raw.radiusKm, massKg: raw.massKg },
    color: raw.color,
    surface: raw.surface,
    orbit: { ...convertOrbit({ ...raw, periodDays: 0 }), periodSec },
    description: raw.description,
    facts: raw.facts,
  }
}

function convertNamedAsteroid(raw: RawComet): NamedAsteroidData {
  return { ...convertComet(raw), category: 'asteroid' }
}

// ————— binary writer (format "SSB1", see src/data/binaryLoaders.ts) —————

function writeBinaryAsset(file: string, header: unknown, payload: Float32Array): void {
  const json = Buffer.from(JSON.stringify(header), 'utf-8')
  const pad = (4 - (json.length % 4)) % 4
  const headerBuf = Buffer.concat([json, Buffer.alloc(pad, 0x20)])
  const preamble = Buffer.alloc(8)
  preamble.write('SSB1', 0, 'ascii')
  preamble.writeUInt32LE(headerBuf.length, 4)
  const payloadBuf = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength)
  writeFileSync(join(OUT_DIR, file), Buffer.concat([preamble, headerBuf, payloadBuf]))
}

// ————— asteroid field synthesis —————

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

function gaussian(rand: () => number): number {
  // Box–Muller
  const u = Math.max(rand(), 1e-12)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const KIRKWOOD_GAPS_AU = [2.502, 2.825, 2.958, 3.279]
const FIELD_STRIDE = 8

interface FieldGroup {
  name: 'mainBelt' | 'trojans' | 'kuiperBelt'
  index: number
  count: number
  generate(rand: () => number, out: Float32Array, offset: number): void
}

function writeRecord(
  out: Float32Array,
  offset: number,
  aAu: number,
  e: number,
  iRad: number,
  node: number,
  peri: number,
  m0: number,
  radiusKm: number,
  group: number,
): void {
  out[offset] = aAu * AU_KM
  out[offset + 1] = e
  out[offset + 2] = iRad
  out[offset + 3] = node
  out[offset + 4] = peri
  out[offset + 5] = m0
  out[offset + 6] = radiusKm
  out[offset + 7] = group
}

const FIELD_GROUPS: FieldGroup[] = [
  {
    name: 'mainBelt',
    index: 0,
    count: 3800,
    generate(rand, out, offset) {
      let aAu: number
      do {
        aAu = 2.06 + rand() * (3.28 - 2.06)
      } while (KIRKWOOD_GAPS_AU.some((gap) => Math.abs(aAu - gap) < 0.03))
      writeRecord(
        out,
        offset,
        aAu,
        Math.pow(rand(), 1.5) * 0.28,
        Math.abs(gaussian(rand)) * 8 * DEG,
        rand() * Math.PI * 2,
        rand() * Math.PI * 2,
        rand() * Math.PI * 2,
        0.5 + Math.pow(rand(), 4) * 60,
        0,
      )
    },
  },
  {
    name: 'trojans',
    index: 1,
    count: 1300,
    generate(rand, out, offset) {
      // Two clouds ±60° from Jupiter (mean longitude ~34.4° at J2000).
      const jupiterLongitude = 34.4 * DEG
      const cloud = rand() < 0.5 ? 1 : -1
      const lambda = jupiterLongitude + cloud * (60 * DEG) + gaussian(rand) * 14 * DEG
      const node = rand() * Math.PI * 2
      const peri = rand() * Math.PI * 2
      writeRecord(
        out,
        offset,
        5.2034 + gaussian(rand) * 0.08,
        rand() * 0.12,
        Math.abs(gaussian(rand)) * 12 * DEG,
        node,
        peri,
        lambda - node - peri,
        0.5 + Math.pow(rand(), 4) * 45,
        1,
      )
    },
  },
  {
    name: 'kuiperBelt',
    index: 2,
    count: 1900,
    generate(rand, out, offset) {
      writeRecord(
        out,
        offset,
        37 + rand() * 11,
        rand() * 0.15,
        Math.abs(gaussian(rand)) * 6 * DEG,
        rand() * Math.PI * 2,
        rand() * Math.PI * 2,
        rand() * Math.PI * 2,
        5 + Math.pow(rand(), 3) * 120,
        2,
      )
    },
  },
]

function generateAsteroidField(): { payload: Float32Array; header: object; count: number } {
  const rand = mulberry32(0x501a5) // deterministic seed → reproducible builds
  const total = FIELD_GROUPS.reduce((sum, g) => sum + g.count, 0)
  const payload = new Float32Array(total * FIELD_STRIDE)
  let i = 0
  for (const group of FIELD_GROUPS) {
    for (let n = 0; n < group.count; n++) {
      group.generate(rand, payload, i * FIELD_STRIDE)
      i++
    }
  }
  return {
    payload,
    count: total,
    header: {
      kind: 'asteroid-field',
      count: total,
      stride: FIELD_STRIDE,
      fields: ['aKm', 'e', 'inclination', 'node', 'argPeriapsis', 'm0', 'radiusKm', 'group'],
      groups: FIELD_GROUPS.map((g) => ({ name: g.name, index: g.index, count: g.count })),
    },
  }
}

// ————— orbit path sampling —————

function generateOrbitPaths(
  bodies: { id: string; orbit?: OrbitalElements; segments: number }[],
): { payload: Float32Array; header: object; count: number } {
  const entries: { bodyId: string; offsetFloats: number; pointCount: number }[] = []
  const chunks: Float32Array[] = []
  let offsetFloats = 0
  for (const body of bodies) {
    if (!body.orbit) continue
    const samples = sampleOrbitPath(body.orbit, body.segments)
    entries.push({ bodyId: body.id, offsetFloats, pointCount: body.segments })
    chunks.push(samples)
    offsetFloats += samples.length
  }
  const payload = new Float32Array(offsetFloats)
  let cursor = 0
  for (const chunk of chunks) {
    payload.set(chunk, cursor)
    cursor += chunk.length
  }
  return { payload, header: { kind: 'orbit-paths', entries }, count: entries.length }
}

// ————— main —————

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true })

  const planets = readSource<RawPlanet[]>('planets.json').map(convertPlanet)
  const moons = readSource<RawMoon[]>('moons.json').map(convertMoon)
  const comets = readSource<RawComet[]>('comets.json').map(convertComet)
  const namedAsteroids = readSource<RawComet[]>('named-asteroids.json').map(convertNamedAsteroid)

  writeFileSync(join(OUT_DIR, 'planets.v1.json'), JSON.stringify(planets, null, 2))
  writeFileSync(join(OUT_DIR, 'moons.v1.json'), JSON.stringify(moons, null, 2))
  writeFileSync(join(OUT_DIR, 'comets.v1.json'), JSON.stringify(comets, null, 2))
  writeFileSync(join(OUT_DIR, 'asteroids-named.v1.json'), JSON.stringify(namedAsteroids, null, 2))

  const field = generateAsteroidField()
  writeBinaryAsset('asteroids.v1.bin', field.header, field.payload)

  const paths = generateOrbitPaths([
    ...planets.map((p) => ({ id: p.id, orbit: p.orbit, segments: 512 })),
    ...namedAsteroids.map((a) => ({ id: a.id, orbit: a.orbit, segments: 512 })),
    ...comets.map((c) => ({ id: c.id, orbit: c.orbit, segments: 1024 })),
  ])
  writeBinaryAsset('orbit-paths.v1.bin', paths.header, paths.payload)

  const meta: SolarSystemMeta = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    epoch: 'J2000',
    units: { length: 'km', time: 's', angle: 'rad' },
    counts: {
      planets: planets.filter((p) => p.category === 'planet').length,
      dwarfPlanets: planets.filter((p) => p.category === 'dwarfPlanet').length,
      moons: moons.length,
      comets: comets.length,
      namedAsteroids: namedAsteroids.length,
      asteroidField: field.count,
    },
    files: {
      planets: 'planets.v1.json',
      moons: 'moons.v1.json',
      comets: 'comets.v1.json',
      namedAsteroids: 'asteroids-named.v1.json',
      asteroidField: 'asteroids.v1.bin',
      orbitPaths: 'orbit-paths.v1.bin',
    },
  }
  writeFileSync(join(OUT_DIR, 'solar-system.meta.json'), JSON.stringify(meta, null, 2))

  console.log(`✓ ${planets.length} planets/dwarfs, ${moons.length} moons, ${comets.length} comets`)
  console.log(`✓ asteroid field: ${field.count} records`)
  console.log(`✓ orbit paths: ${paths.count} polylines`)
  console.log(`→ ${OUT_DIR}`)
}

main()
