<script lang="ts">
  import { onMount } from 'svelte'
  import { SolarSystemEngine } from '../rendering/threeScene'
  import { WebGPUUnsupportedError } from '../rendering/renderer'
  import { StaticAssetDataProvider } from '../data/StaticAssetDataProvider'
  import { engineStatus, engineErrorMessage } from '../state/stores'
  import SearchBar from './SearchBar.svelte'
  import LayersPanel from './LayersPanel.svelte'
  import TimeControls from './TimeControls.svelte'
  import InfoPanel from './InfoPanel.svelte'
  import ScaleAnnotation from './ScaleAnnotation.svelte'
  import LightTravelHud from './LightTravelHud.svelte'

  let container: HTMLDivElement
  let engine: SolarSystemEngine | null = null

  onMount(() => {
    void boot()
    return () => engine?.dispose()
  })

  async function boot(): Promise<void> {
    engineStatus.set('loading')
    try {
      engine = await SolarSystemEngine.create(container, new StaticAssetDataProvider())
      engineStatus.set('ready')
    } catch (err) {
      if (err instanceof WebGPUUnsupportedError) {
        engineStatus.set('unsupported')
      } else {
        console.error('Engine failed to start', err)
        engineErrorMessage.set(err instanceof Error ? err.message : String(err))
        engineStatus.set('error')
      }
    }
  }
</script>

<div class="stage">
  <div class="viewport" bind:this={container}></div>

  {#if $engineStatus === 'ready'}
    <header class="top-bar">
      <div class="brand">
        <span class="brand-mark">☀</span>
        <span class="brand-name">SolarScale</span>
      </div>
      <SearchBar />
    </header>
    <LayersPanel />
    <TimeControls />
    <InfoPanel />
    <ScaleAnnotation />
    <LightTravelHud />
  {:else if $engineStatus === 'loading' || $engineStatus === 'booting'}
    <div class="overlay">
      <div class="loader panel">
        <div class="spinner"></div>
        <p>Preparing the Solar System…</p>
      </div>
    </div>
  {:else if $engineStatus === 'unsupported'}
    <div class="overlay">
      <div class="notice panel">
        <h1>WebGPU required</h1>
        <p>
          SolarScale renders with WebGPU, and this browser doesn't support it (or has it
          disabled). Try a current version of Chrome, Edge, or Safari — or enable WebGPU in
          your browser's flags.
        </p>
      </div>
    </div>
  {:else}
    <div class="overlay">
      <div class="notice panel">
        <h1>Something went wrong</h1>
        <p>The engine failed to start: {$engineErrorMessage}</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .viewport {
    position: absolute;
    inset: 0;
  }

  .top-bar {
    position: absolute;
    top: 14px;
    left: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    pointer-events: none;
  }

  .top-bar :global(> *) {
    pointer-events: auto;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 650;
    font-size: 17px;
    letter-spacing: 0.02em;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
  }

  .brand-mark {
    color: #ffd479;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: radial-gradient(ellipse at center, #0a1020 0%, #04070d 100%);
  }

  .loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 28px 40px;
    color: var(--text-dim);
  }

  .spinner {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid rgba(109, 179, 255, 0.2);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .notice {
    max-width: 440px;
    padding: 28px 32px;
  }

  .notice h1 {
    margin: 0 0 10px;
    font-size: 20px;
  }

  .notice p {
    margin: 0;
    color: var(--text-dim);
    line-height: 1.55;
  }
</style>
