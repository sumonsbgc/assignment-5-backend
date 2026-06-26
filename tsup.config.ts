import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/workers/video-worker.ts'],
  format: ['esm'],
  outDir: 'dist',
  dts: false,
  clean: true,
  // The Prisma generated client (prisma/generated/) is CJS and internally
  // calls require('@prisma/client-runtime-utils'). Bundling CJS into an ESM
  // chunk breaks those require() calls. Adding createRequire as a banner
  // polyfills require() so the bundled CJS code works inside the ESM output.
  banner: {
    js: `import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);`,
  },
})
