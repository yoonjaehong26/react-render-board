import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rrbInjectPlugin } from './rrb-inject-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), rrbInjectPlugin()],
})
