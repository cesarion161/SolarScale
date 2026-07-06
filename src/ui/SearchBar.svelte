<script lang="ts">
  import { bodyCatalog, selectedObjectId } from '../state/stores'
  import { selectObject } from '../state/appState'
  import { CATEGORY_LABELS } from './format'

  let query = $state('')
  let focused = $state(false)

  const results = $derived(
    query.trim().length === 0
      ? []
      : $bodyCatalog
          .filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()))
          .slice(0, 8),
  )

  function choose(id: string): void {
    selectObject(id)
    query = ''
    focused = false
  }
</script>

<div class="search">
  <svg class="icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.5" y2="16.5" />
  </svg>
  <input
    type="text"
    placeholder="Search planets, moons, comets…"
    bind:value={query}
    onfocus={() => (focused = true)}
    onblur={() => setTimeout(() => (focused = false), 150)}
  />
  {#if focused && results.length > 0}
    <ul class="results panel">
      {#each results as body (body.id)}
        <li>
          <button
            class:selected={body.id === $selectedObjectId}
            onclick={() => choose(body.id)}
          >
            <span class="swatch" style="background:{body.color}"></span>
            <span class="name">{body.name}</span>
            <span class="category">{CATEGORY_LABELS[body.category]}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search {
    position: relative;
    width: min(320px, 50vw);
  }

  .icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-dim);
    pointer-events: none;
  }

  input {
    width: 100%;
    padding: 9px 12px 9px 34px;
    border-radius: 999px;
    border: 1px solid var(--panel-border);
    background: var(--panel);
    backdrop-filter: blur(14px);
    color: var(--text);
    font-size: 13px;
    outline: none;
  }

  input:focus {
    border-color: var(--accent);
  }

  input::placeholder {
    color: var(--text-dim);
  }

  .results {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    margin: 0;
    padding: 6px;
    list-style: none;
    z-index: 30;
  }

  .results button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    text-align: left;
    font-size: 13px;
  }

  .results button:hover,
  .results button.selected {
    background: var(--accent-soft);
  }

  .swatch {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .name {
    flex: 1;
  }

  .category {
    color: var(--text-dim);
    font-size: 11px;
  }
</style>
