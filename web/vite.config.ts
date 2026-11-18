import { defineConfig } from "vite";

// The game data (moves, sprites, stages) is forked from the Excel version (../data) so the web game can grow on its own.
export default defineConfig({
  base: "./",
  publicDir: "data",
  build: { outDir: "dist", assetsInlineLimit: 0 },
});
