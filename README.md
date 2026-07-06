# SolarScale

An educational, WebGPU-rendered Solar System explorer built to answer one question viscerally:
**how empty is space, really?**

Zoom smoothly from the whole Solar System down to a 2 km comet nucleus, watch planets orbit and
spin, and follow a pulse of sunlight as it takes 8 minutes 19 seconds to reach Earth — all at the
system's true physical scale (with honest, clearly-annotated exaggerated modes when you need to
actually see things).

## Stack

- **TypeScript + Vite + Svelte 5** — UI shell only (panels, search, toggles, time controls)
- **Three.js on WebGPU** — all rendering; WebGPU is the *only* backend (no WebGL2 fallback);
  unsupported browsers get a clear message
- **Static data assets** — JSON for metadata, custom binary (`SSB1`) for dense datasets,
  generated offline by `/tools`
- No runtime backend, no WASM (by design, for the MVP)

## Getting started

```bash
npm install
npm run generate-data   # build /public/data from /tools/source-data
npm run dev             # Vite dev server (needs a WebGPU browser)
```

Other scripts: `npm run build` (production bundle), `npm run preview`, `npm run check`
(svelte-check over the whole app).

## What's inside

| Feature | Notes |
| --- | --- |
| 4 scale modes | True scale · Big bodies (real distances, inflated sizes) · Compressed distances (√r) · Comparison "orrery" view — each with an educational annotation stating exactly what is and isn't accurate, plus a km-per-pixel scale bar in distance-real modes |
| Bodies | Sun, 8 planets (Saturn ringed), 5 dwarf planets, 16 major moons, 5 famous comets (with distance-driven tails), 4 named asteroids, ~7,000-asteroid field (main belt with Kirkwood gaps, Jupiter trojans, Kuiper belt) |
| Motion | Keplerian orbital propagation (J2000 elements), axial tilt, per-body rotation incl. retrograde (Venus, Uranus, Triton…) |
| Light travel | Expanding wavefront spheres emitted from the Sun, mapped consistently through every scale mode; HUD shows pulse age and per-planet arrival times computed from live positions |
| Time | Central simulation clock: pause, 1×–8× real time plus educational speeds up to 1 month/s |
| Interaction | Orbit/pan/pinch camera with a 12-orders-of-magnitude exponential zoom, click-to-select, search, fly-to transitions, per-object info panels with live Sun distance & light time |
| Labels | Single-canvas 2D overlay: priority-ranked, collision-culled labels + presence dots for sub-pixel bodies. No DOM/Svelte label elements |

## Architecture

```
src/
  ui/          Svelte components — UI shell only, no per-frame reactivity
  state/       Svelte stores: coarse app state (selection, mode, toggles, speed)
  rendering/   three.js engine: scene conductor, camera, sub-renderers, labels
  simulation/  clock, Kepler solver, rotation, scale modes, light travel
  data/        provider interface + static-asset implementation + binary codec
  gpu/         compute boundary: CPU implementations behind WGSL-ready interfaces
tools/         offline preprocessing (source tables → optimized static assets)
public/data/   generated runtime assets (JSON + SSB1 binaries)
```

Key boundaries, and why they exist:

- **UI ↔ engine**: the engine subscribes to a handful of stores and pushes throttled readouts
  back (4 Hz). Nothing per-frame crosses Svelte reactivity.
- **Data provider** (`SolarSystemDataProvider`): rendering/simulation never touch fetch or file
  formats. `StaticAssetDataProvider` serves the MVP; an `ApiDataProvider` can slot in later
  without engine changes.
- **`src/gpu`**: compute-heavy systems (currently asteroid-field propagation) live behind typed
  interfaces with CPU implementations, sized for a later WGSL compute-shader port with zero
  changes to UI/data/rendering layers.
- **Precision**: positions are computed in JS doubles (km), display coordinates use a floating
  origin at the camera focus — the double-precision subtraction happens on the CPU, so a moon
  4.5 billion km from the Sun renders jitter-free.
- **Scale modes** are pure radially-monotonic mappings km → scene units, so bodies, orbit paths
  and the light wavefront stay mutually consistent in every mode.

## Data pipeline

`tools/source-data/*.json` hold human-editable astronomy tables (AU, degrees, days).
`npm run generate-data` normalizes them to runtime conventions (km, seconds, radians, J2000),
synthesizes the asteroid field (seeded, reproducible), pre-samples orbit polylines, and writes
`/public/data`. Binary assets use a tiny self-describing container (`SSB1`: magic + JSON header +
Float32 payload) decoded by `src/data/binaryLoaders.ts`.

Planet surfaces are procedurally generated at startup from seeded noise (no texture downloads);
`/public/textures` is reserved for real imagery later.

## Known MVP simplifications

- Keplerian elements are fixed (no secular drift); positions are educational, not ephemeris-grade.
- Axial tilt is applied about a fixed ecliptic axis (no precession direction).
- Moon orbits in exaggerated modes are compressed (annotated in-app).
- No shadows/eclipses; the sim clock pauses while the tab is hidden (rAF-driven).
