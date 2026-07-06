<script lang="ts">
  import { scaleMode, visibility, type VisibilityCategory } from '../state/stores'
  import {
    setScaleMode,
    toggleCategory,
    emitLightPulse,
    clearLightPulses,
    resetView,
  } from '../state/appState'
  import { SCALE_MODE_LIST } from '../simulation/scaleModes'

  let collapsed = $state(false)

  const toggles: { key: VisibilityCategory; label: string }[] = [
    { key: 'planets', label: 'Planets' },
    { key: 'dwarfPlanets', label: 'Dwarf planets' },
    { key: 'moons', label: 'Moons' },
    { key: 'asteroids', label: 'Asteroids' },
    { key: 'comets', label: 'Comets' },
    { key: 'orbits', label: 'Orbit paths' },
    { key: 'labels', label: 'Labels' },
    { key: 'lightTravel', label: 'Sunlight travel' },
  ]
</script>

<aside class="layers panel" class:collapsed>
  <button class="header" onclick={() => (collapsed = !collapsed)}>
    <span>View</span>
    <span class="chevron">{collapsed ? '▸' : '▾'}</span>
  </button>

  {#if !collapsed}
    <section>
      <h3>Scale mode</h3>
      <div class="modes">
        {#each SCALE_MODE_LIST as mode (mode.id)}
          <button
            class="mode"
            class:active={$scaleMode === mode.id}
            onclick={() => setScaleMode(mode.id)}
            title={mode.accuracyNote}
          >
            <span class="mode-label">{mode.label}</span>
            <span class="mode-tagline">{mode.tagline}</span>
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h3>Show</h3>
      <div class="toggles">
        {#each toggles as t (t.key)}
          <label class="toggle">
            <input
              type="checkbox"
              checked={$visibility[t.key]}
              onchange={() => toggleCategory(t.key)}
            />
            <span>{t.label}</span>
          </label>
        {/each}
      </div>
    </section>

    <section class="actions">
      <button class="pill" onclick={emitLightPulse}>☀ Emit light pulse</button>
      {#if $visibility.lightTravel}
        <button
          class="pill"
          title="Remove all wavefronts and stop automatic pulses"
          onclick={clearLightPulses}
        >
          ✕ Clear pulses
        </button>
      {/if}
      <button class="pill" onclick={resetView}>⌂ Reset view</button>
    </section>
  {/if}
</aside>

<style>
  .layers {
    position: absolute;
    top: 64px;
    left: 16px;
    width: 236px;
    max-height: calc(100% - 170px);
    overflow-y: auto;
    padding: 4px 14px 14px;
    z-index: 20;
  }

  .layers.collapsed {
    padding-bottom: 4px;
    width: auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    width: 100%;
    padding: 10px 2px;
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
  }

  h3 {
    margin: 12px 0 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }

  .modes {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mode {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--panel-border);
    text-align: left;
    transition: all 0.15s ease;
  }

  .mode:hover {
    border-color: rgba(140, 170, 220, 0.35);
  }

  .mode.active {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .mode-label {
    font-size: 13px;
    font-weight: 600;
  }

  .mode-tagline {
    font-size: 11px;
    color: var(--text-dim);
    line-height: 1.35;
  }

  .toggles {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 5px 4px;
    font-size: 13px;
    cursor: pointer;
    border-radius: 6px;
  }

  .toggle:hover {
    background: rgba(140, 170, 220, 0.08);
  }

  .toggle input {
    accent-color: var(--accent);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }
</style>
