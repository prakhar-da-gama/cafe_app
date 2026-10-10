import { useState } from 'react'
import './App.css'
import { getToken } from './api'
import { useScreen } from './useScreen'
import Login from './pages/admin/Login'
import VerifyOtp from './pages/VerifyOtp'
import AdminHome from './pages/admin/AdminHome'
import ComingSoon from './pages/admin/ComingSoon'
import ManagerHome from './pages/manager/ManagerHome'
import ManagerMenu from './pages/manager/ManagerMenu'
import ManageMenu from './pages/manager/ManageMenu'
import OutOfStockItems from './pages/manager/OutOfStockItems'
import OutOfStockToppings from './pages/manager/OutOfStockToppings'
import ServiceReviews from './pages/manager/ServiceReviews'

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
  | 'service-reviews'

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

  // The serious blue/white dashboard theme applies everywhere except the
  // login + OTP screens, which keep the shared candy auth look.
  const authScreen = screen === 'login' || screen === 'otp'

  return (
    <div className={authScreen ? 'app dashboard' : 'app dashboard theme-pro'}>
      {screen === 'login' && (
        <Login
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
          onViewServiceReviews={() => navigate('service-reviews')}
        />
      )}

      {screen === 'menu' && <ManagerMenu onBack={goBack} />}

      {screen === 'manage-menu' && <ManageMenu onBack={goBack} />}

      {screen === 'oos-items' && <OutOfStockItems onBack={goBack} />}

      {screen === 'oos-toppings' && <OutOfStockToppings onBack={goBack} />}

      {screen === 'service-reviews' && <ServiceReviews onBack={goBack} />}
    </div>
  )
}
