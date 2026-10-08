import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ManagerApp from './ManagerApp.tsx'

// The manager area lives under /manager; everything else is the customer app.
const isManager = window.location.pathname.startsWith('/app/manager')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isManager ? <ManagerApp /> : <App />}</StrictMode>,
)
