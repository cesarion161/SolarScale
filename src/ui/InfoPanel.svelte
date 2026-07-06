<script lang="ts">
  import { bodyCatalog, liveReadout, scaleMode, selectedObjectId } from '../state/stores'
  import { selectObject } from '../state/appState'
  import { lightTravelTimeSec } from '../simulation/lightTravel'
  import { AU_KM, SCALE_MODES } from '../simulation/scaleModes'
  import {
    CATEGORY_LABELS,
    formatAu,
    formatDegrees,
    formatDuration,
    formatKm,
    formatMass,
    formatPeriod,
  } from './format'

  const body = $derived($bodyCatalog.find((b) => b.id === $selectedObjectId) ?? null)
  const parent = $derived(
    body?.parentId ? $bodyCatalog.find((b) => b.id === body.parentId) : null,
  )
  const sunDistKm = $derived($liveReadout.selectedSunDistanceKm)
  const cameraDistKm = $derived($liveReadout.selectedCameraDistanceKm)
  const distancesReal = $derived(SCALE_MODES[$scaleMode].distancesReal)
</script>

{#if body}
  <aside class="info panel">
    <header>
      <div>
        <span class="category" style="color:{body.color}">{CATEGORY_LABELS[body.category]}</span>
        <h2>{body.name}</h2>
        {#if parent}
          <button class="parent-link" onclick={() => selectObject(parent.id)}>
            moon of {parent.name}
          </button>
        {/if}
      </div>
      <button class="close" onclick={() => selectObject(null)} aria-label="Close">✕</button>
    </header>

    <p class="description">{body.description}</p>

    <dl>
      {#if sunDistKm !== null && body.category !== 'star'}
        <dt>Distance from Sun now</dt>
        <dd>
          {formatAu(sunDistKm)} · {formatKm(sunDistKm)}
          <span class="light-time">☀ light takes {formatDuration(lightTravelTimeSec(sunDistKm))}</span>
        </dd>
      {/if}
      {#if cameraDistKm !== null}
        <dt>Distance from camera</dt>
        <dd title="Distance from the camera to the body's surface">
          {#if cameraDistKm > AU_KM / 100}{formatAu(cameraDistKm)} · {/if}{formatKm(cameraDistKm)}
          {#if !distancesReal}
            <span class="approx">approximate — distances are compressed in this mode</span>
          {/if}
        </dd>
      {/if}
      <dt>Mean radius</dt>
      <dd>{formatKm(body.radiusKm)}</dd>
      {#if body.massKg}
        <dt>Mass</dt>
        <dd>{formatMass(body.massKg)}</dd>
      {/if}
      {#if body.orbitPeriodSec}
        <dt>Orbital period</dt>
        <dd>{formatDuration(body.orbitPeriodSec)}</dd>
      {/if}
      {#if body.rotationPeriodSec}
        <dt>Rotation period</dt>
        <dd>{formatPeriod(body.rotationPeriodSec)}</dd>
      {/if}
      {#if body.axialTiltRad !== undefined}
        <dt>Axial tilt</dt>
        <dd>{formatDegrees(body.axialTiltRad)}</dd>
      {/if}
    </dl>

    {#if body.facts?.length}
      <ul class="facts">
        {#each body.facts as fact (fact)}
          <li>{fact}</li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  .info {
    position: absolute;
    top: 64px;
    right: 16px;
    width: 300px;
    max-height: calc(100% - 170px);
    overflow-y: auto;
    padding: 16px;
    z-index: 20;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .category {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  h2 {
    margin: 2px 0 0;
    font-size: 22px;
  }

  .parent-link {
    padding: 0;
    font-size: 12px;
    color: var(--accent);
  }

  .parent-link:hover {
    text-decoration: underline;
  }

  .close {
    color: var(--text-dim);
    font-size: 14px;
    padding: 4px 6px;
    border-radius: 6px;
  }

  .close:hover {
    background: rgba(140, 170, 220, 0.12);
    color: var(--text);
  }

  .description {
    margin: 10px 0 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-dim);
  }

  dl {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2px;
    margin: 14px 0 0;
  }

  dt {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-dim);
    margin-top: 8px;
  }

  dd {
    margin: 1px 0 0;
    font-size: 13px;
  }

  .light-time {
    display: block;
    color: #ffd479;
    font-size: 12px;
    margin-top: 2px;
  }

  .approx {
    display: block;
    color: var(--text-dim);
    font-size: 11px;
    margin-top: 2px;
  }

  .facts {
    margin: 14px 0 0;
    padding: 0 0 0 18px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .facts li {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-dim);
  }

  @media (max-width: 720px) {
    .info {
      top: auto;
      bottom: 76px;
      right: 12px;
      left: 12px;
      width: auto;
      max-height: 42vh;
    }
  }
</style>
