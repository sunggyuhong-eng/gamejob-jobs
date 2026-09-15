import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function copyRuntimeData() {
  return {
    name: 'copy-runtime-data',
    closeBundle() {
      for (const name of ['data', 'reports']) {
        const source = resolve(import.meta.dirname, name)
        if (existsSync(source)) cpSync(source, resolve(import.meta.dirname, 'dist', name), { recursive: true })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyRuntimeData()],
  base: './',
  build: { outDir: 'dist' }
})
