<script lang="ts">
  import { liveReadout, paused, timeScale, TIME_SCALE_PRESETS } from '../state/stores'
  import { setTimeScale, togglePaused } from '../state/appState'
  import { formatSimDate } from './format'
</script>

<div class="time panel">
  <button class="play" onclick={togglePaused} title={$paused ? 'Play' : 'Pause'}>
    {#if $paused}
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <polygon points="6,4 20,12 6,20" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <rect x="5" y="4" width="5" height="16" rx="1" />
        <rect x="14" y="4" width="5" height="16" rx="1" />
      </svg>
    {/if}
  </button>

  <div class="speeds">
    {#each TIME_SCALE_PRESETS as preset (preset.value)}
      <button
        class="pill"
        class:active={$timeScale === preset.value}
        title={preset.hint}
        onclick={() => setTimeScale(preset.value)}
      >
        {preset.label}
      </button>
    {/each}
  </div>

  <div class="date" class:paused={$paused}>
    {formatSimDate($liveReadout.simDateIso)}
  </div>
</div>

<style>
  .time {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    z-index: 20;
    max-width: calc(100vw - 32px);
  }

  .play {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    color: var(--accent);
    flex-shrink: 0;
  }

  .speeds {
    display: flex;
    gap: 5px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .speeds::-webkit-scrollbar {
    display: none;
  }

  .date {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .date.paused {
    color: #d99a4e;
  }

  @media (max-width: 720px) {
    .date {
      display: none;
    }
  }
</style>
