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
const isDeploy = window.location.pathname === '/deploy'
const content = isDeploy
  ? <Suspense fallback={<div className="deploy-shell"><p>Loading deployment console…</p></div>}><DeployPage /></Suspense>
  : <App />

createRoot(document.getElementById('root')!).render(<StrictMode>{content}</StrictMode>)
if (isDeploy) {
  requestAnimationFrame(() => document.getElementById('boot')?.remove())
}
// Otherwise #boot stays until App marks data + fonts ready.
