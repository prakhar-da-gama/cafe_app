import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ManagerApp from './ManagerApp.tsx'
import AdminApp from './AdminApp.tsx'

// The admin area lives under /app/admin, the manager area under /app/manager;
// everything else is the customer app.
const path = window.location.pathname
const root = path.startsWith('/app/admin') ? (
  <AdminApp />
) : path.startsWith('/app/manager') ? (
  <ManagerApp />
) : (
  <App />
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>{root}</StrictMode>,
)
