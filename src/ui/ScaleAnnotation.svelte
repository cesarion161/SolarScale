<script lang="ts">
  import { liveReadout, scaleMode } from '../state/stores'
  import { SCALE_MODES } from '../simulation/scaleModes'
  import { formatKm } from './format'

  let expanded = $state(true)

  const mode = $derived(SCALE_MODES[$scaleMode])
  const kmPerPixel = $derived($liveReadout.kmPerPixel)

  // A ~120 px scale bar labelled with a round number of real km.
  const scaleBar = $derived.by(() => {
    if (!kmPerPixel) return null
    const targetKm = kmPerPixel * 120
    const exp = 10 ** Math.floor(Math.log10(targetKm))
    const nice = [1, 2, 5, 10].map((n) => n * exp).reduce((a, b) =>
      Math.abs(b - targetKm) < Math.abs(a - targetKm) ? b : a,
    )
    return { px: nice / kmPerPixel, km: nice }
  })
</script>

<div class="annotation panel" class:expanded>
  <button class="mode-line" onclick={() => (expanded = !expanded)}>
    <span class="dot" class:accurate={mode.distancesReal}></span>
    <strong>{mode.label}</strong>
    <span class="chevron">{expanded ? '▾' : '▴'}</span>
  </button>
  {#if expanded}
    <p class="note">{mode.accuracyNote}</p>
    {#if scaleBar}
      <div class="scale-bar">
        <div class="bar" style="width:{scaleBar.px}px"></div>
        <span>{formatKm(scaleBar.km)}</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .annotation {
    position: absolute;
    bottom: 16px;
    left: 16px;
    max-width: 300px;
    padding: 10px 14px;
    z-index: 15;
  }

  .mode-line {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0;
    font-size: 13px;
    text-align: left;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #d99a4e;
    flex-shrink: 0;
  }

  .dot.accurate {
    background: #5fce7f;
  }

  .chevron {
    margin-left: auto;
    color: var(--text-dim);
    font-size: 11px;
  }

  .note {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-dim);
  }

  .scale-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    font-size: 11px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }

  .bar {
    height: 4px;
    border-inline: 1.5px solid var(--accent);
    background:
      linear-gradient(var(--accent), var(--accent)) center / 100% 1.5px no-repeat;
    max-width: 240px;
  }

  @media (max-width: 720px) {
    .annotation {
      display: none;
    }
  }
</style>
