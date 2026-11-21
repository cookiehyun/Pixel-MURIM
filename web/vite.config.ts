import { defineConfig } from "vite";

// The game data (moves, sprites, stages) is forked from the Excel version (../data) so the web game can grow on its own.
export default defineConfig({
  base: "./",
  publicDir: "data",
  build: { outDir: "dist", assetsInlineLimit: 0 },
  // shown small on the title screen, to tell which build a browser is running
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(5, 16).replace("T", " ")) },
});
