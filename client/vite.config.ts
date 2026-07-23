import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  build: {
    // This Vite build's default CSS minifier silently drops some of our
    // own overrides in index.css for vis-timeline's bundled stylesheet
    // (vis-timeline/styles/vis-timeline-graph2d.css) — rules sharing an
    // exact selector across the two source files get merged/deduped,
    // keeping only vis-timeline's own declaration even when ours carries
    // !important. Confirmed by diffing the built CSS: our overrides were
    // present in dev (unminified, injected via <style> tags) but missing
    // entirely from a minified production build. Disabling CSS
    // minification avoids that — the app is small enough that the extra
    // few KB over the wire doesn't matter.
    cssMinify: false,
  },
})
