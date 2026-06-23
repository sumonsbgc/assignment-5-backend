import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/workers/video-worker.ts'],
  format: ['esm'],
  outDir: 'dist',
  dts: false,
  clean: true,
  // Keep Prisma external — bundling the generated client pulls in internal
  // Prisma packages (@prisma/client-runtime-utils) that aren't top-level
  // deps and cause esbuild to fail. Node resolves them fine at runtime.
  external: ['@prisma/client', '@prisma/client-runtime-utils'],
})
