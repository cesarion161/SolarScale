import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  build: {
    // WebGPU-era browsers only; allows top-level await and modern syntax.
    target: 'esnext',
  },
})
