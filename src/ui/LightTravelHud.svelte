<script lang="ts">
  import { liveReadout, timeScale, visibility } from '../state/stores'
  import { setTimeScale } from '../state/appState'
  import { formatDuration } from './format'

  const pulseAge = $derived($liveReadout.lightPulseAgeSec)
  const arrivals = $derived($liveReadout.lightArrivals)
  const slowTime = $derived($timeScale > 3600)
</script>

<!-- Shown while the auto-pulse toggle is on OR any pulse is still in flight,
     so a single manually emitted pulse gets its readout too. -->
{#if $visibility.lightTravel || pulseAge !== null}
  <aside class="hud panel">
    <h3>☀ Sunlight in flight</h3>
    {#if pulseAge !== null}
      <div class="age">
        <span class="value">{formatDuration(pulseAge)}</span>
        <span class="caption">since the newest pulse left the Sun</span>
      </div>
      <ul>
        {#each arrivals as arrival (arrival.id)}
          <li class:reached={arrival.reached}>
            <span class="check">{arrival.reached ? '✓' : '·'}</span>
            <span class="name">{arrival.name}</span>
            <span class="time">{formatDuration(arrival.travelTimeSec)}</span>
          </li>
        {/each}
      </ul>
      {#if slowTime}
        <button class="hint" onclick={() => setTimeScale(60)}>
          Tip: at this speed light crosses the system almost instantly.
          Switch to 60× to watch it travel →
        </button>
      {/if}
    {:else}
      <p class="caption">Waiting for a pulse…</p>
    {/if}
  </aside>
{/if}

<style>
  .hud {
    position: absolute;
    top: 64px;
    right: 16px;
    width: 232px;
    padding: 14px 16px;
    z-index: 18;
  }

  /* Sit below the info panel when both are open. */
  :global(.info) ~ .hud {
    top: auto;
    bottom: 76px;
  }

  h3 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #ffd479;
  }

  .age {
    margin: 10px 0 4px;
  }

  .value {
    display: block;
    font-size: 24px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .caption {
    font-size: 11.5px;
    color: var(--text-dim);
  }

  ul {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }

  li.reached {
    color: #ffd479;
  }

  .check {
    width: 12px;
    text-align: center;
  }

  .name {
    flex: 1;
  }

  .hint {
    margin-top: 12px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 11.5px;
    line-height: 1.45;
    text-align: left;
    width: 100%;
  }

  @media (max-width: 720px) {
    .hud {
      display: none;
    }
  }
</style>
