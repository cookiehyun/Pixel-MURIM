import { defineConfig } from "vite";

// The game data (moves, sprites, stages) is shared with the Excel version: serve ../data as-is.
export default defineConfig({
  base: "./",
  publicDir: "../data",
  build: { outDir: "dist", assetsInlineLimit: 0 },
});
