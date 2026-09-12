import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // loadEnv is required here because Vite resolves .env files after importing
  // this config. Only public on-chain addresses are explicitly embedded.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    define: {
      __WARROOM_GAME_ADDRESS__: JSON.stringify(env.WARROOM_GAME_ADDRESS || ''),
      __WAR_TOKEN_ADDRESS__: JSON.stringify(env.WAR_TOKEN_ADDRESS || ''),
      __TREASURY_ADDRESS__: JSON.stringify(env.TREASURY_ADDRESS || ''),
      __ADMIN_ADDRESS__: JSON.stringify(env.ADMIN_ADDRESS || ''),
    },
    server: { host: '127.0.0.1', port: 4173 },
  }
})
