import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const DeployPage = lazy(() => import('./DeployPage'))
const content = window.location.pathname === '/deploy'
  ? <Suspense fallback={<div className="deploy-shell"><p>Loading deployment console…</p></div>}><DeployPage /></Suspense>
  : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {content}
  </StrictMode>,
)
