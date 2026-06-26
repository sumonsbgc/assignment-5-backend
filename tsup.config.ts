import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/workers/video-worker.ts'],
  format: ['esm'],
  outDir: 'dist',
  dts: false,
  clean: true,
  // @prisma/client-runtime-utils is an internal Prisma package required by the
  // generated CJS runtime. Mark it external so esbuild doesn't try to bundle it
  // (build-time fix). The createRequire banner polyfills require() in the ESM
  // output so the bundled CJS code can call require() at runtime (runtime fix).
  external: ['@prisma/client-runtime-utils'],
  banner: {
    js: `import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);`,
  },
})
