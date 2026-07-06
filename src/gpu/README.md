# /src/gpu — compute boundary

This directory isolates compute-heavy subsystems behind narrow interfaces so
they can be migrated from TypeScript to raw WebGPU/WGSL compute shaders
without rewriting the UI, data or rendering layers.

## Current modules

| Interface                 | MVP implementation            | Future WGSL plan                          |
| ------------------------- | ----------------------------- | ----------------------------------------- |
| `AsteroidFieldSimulator`  | `CpuAsteroidFieldSimulator`   | Kepler solve in a compute pass, writing directly into the instance storage buffer (zero CPU↔GPU copies per frame) |

## Migration rules

1. New heavy systems (particles, GPU culling, GPU LOD selection, sunlight
   wavefront fields, dense catalogs) get an interface here first, with a
   CPU reference implementation.
2. Interfaces speak in plain typed arrays / value objects — never in Svelte
   stores or three.js scene objects — so a WGSL implementation can fulfil the
   same contract by binding storage buffers.
3. Only port a module to WGSL after profiling shows the CPU implementation is
   an actual bottleneck (same policy as WASM: no preemptive optimization).
