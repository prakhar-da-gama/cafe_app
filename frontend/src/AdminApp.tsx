import { useState } from 'react'
import './App.css'
import { getToken } from './api'
import { useScreen } from './useScreen'
import Login from './pages/Login'
import VerifyOtp from './pages/VerifyOtp'
import AdminHome from './pages/AdminHome'
import ComingSoon from './pages/ComingSoon'
import ManagerHome from './pages/ManagerHome'
import ManagerMenu from './pages/ManagerMenu'
import ManageMenu from './pages/ManageMenu'
import OutOfStockItems from './pages/OutOfStockItems'
import OutOfStockToppings from './pages/OutOfStockToppings'

type Screen =
  | 'login'
  | 'otp'
  | 'portal'
  | 'dummy'
  | 'manager-home'
  | 'menu'
  | 'manage-menu'
  | 'oos-items'
  | 'oos-toppings'

/** The admin area (served at /app/admin). Login-only — the same login + OTP
 *  screens as the customer app, gated on does-admin-exist so only provisioned
 *  admins can get a code (no self sign-up). After login it opens a portal of
 *  higher-level tools; only the manager dashboard is wired up (admins are
 *  allowed on every manager API), the rest are placeholders. */
export default function AdminApp() {
  // A returning admin with a saved token skips straight to the portal;
  // AdminHome re-validates the token actually belongs to an admin.
  const { screen, navigate, goBack } = useScreen<Screen>(
    getToken() ? 'portal' : 'login',
  )
  const [email, setEmail] = useState('')
  const [dummyTitle, setDummyTitle] = useState('')

  return (
    <div className="app">
      {screen === 'login' && (
        <Login
          adminMode
          onSent={(e) => {
            setEmail(e)
            navigate('otp')
          }}
        />
      )}

      {screen === 'otp' && (
        <VerifyOtp
          email={email}
          onBack={goBack}
          onVerified={() => navigate('portal')}
        />
      )}

      {screen === 'portal' && (
        <AdminHome
          onSignedOut={() => navigate('login')}
          onManagerDashboard={() => navigate('manager-home')}
          onDummy={(title) => {
            setDummyTitle(title)
            navigate('dummy')
          }}
        />
      )}

      {screen === 'dummy' && <ComingSoon title={dummyTitle} onBack={goBack} />}

      {screen === 'manager-home' && (
        <ManagerHome
          onSignedOut={() => navigate('login')}
          onViewMenu={() => navigate('menu')}
          onManageMenu={() => navigate('manage-menu')}
          onViewOosItems={() => navigate('oos-items')}
          onViewOosToppings={() => navigate('oos-toppings')}
        />
      )}

      {screen === 'menu' && <ManagerMenu onBack={goBack} />}

      {screen === 'manage-menu' && <ManageMenu onBack={goBack} />}

      {screen === 'oos-items' && <OutOfStockItems onBack={goBack} />}

      {screen === 'oos-toppings' && <OutOfStockToppings onBack={goBack} />}
    </div>
  )
}
