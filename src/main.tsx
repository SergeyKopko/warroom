import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/chakra-petch/latin-400.css'
import '@fontsource/chakra-petch/latin-500.css'
import '@fontsource/chakra-petch/latin-600.css'
import '@fontsource/chakra-petch/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import App from './App'
import './styles.css'

const DeployPage = lazy(() => import('./DeployPage'))
const content = window.location.pathname === '/deploy'
  ? <Suspense fallback={<div className="deploy-shell"><p>Loading deployment console…</p></div>}><DeployPage /></Suspense>
  : <App />

async function preloadImage(src: string) {
  const image = new Image()
  image.src = src
  await image.decode()
}

async function start() {
  const assetsReady = Promise.all([
    document.fonts.load('400 16px "Chakra Petch"'),
    document.fonts.load('600 16px "Chakra Petch"'),
    document.fonts.load('400 12px "IBM Plex Mono"'),
    document.fonts.load('600 12px "IBM Plex Mono"'),
    preloadImage('/commander-nft-320.png'),
  ])
  // Never leave the user behind the startup veil if an asset host fails.
  await Promise.race([assetsReady, new Promise((resolve) => window.setTimeout(resolve, 4_000))]).catch(() => undefined)
  createRoot(document.getElementById('root')!).render(<StrictMode>{content}</StrictMode>)
  requestAnimationFrame(() => document.getElementById('boot')?.remove())
}

void start()
