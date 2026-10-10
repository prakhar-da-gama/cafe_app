import { useState } from 'react'
import './App.css'
import { getToken } from './api'
import { useScreen } from './useScreen'
import Login from './pages/manager/Login'
import VerifyOtp from './pages/VerifyOtp'
import ManagerHome from './pages/manager/ManagerHome'
import ManagerMenu from './pages/manager/ManagerMenu'
import ManageMenu from './pages/manager/ManageMenu'
import OutOfStockItems from './pages/manager/OutOfStockItems'
import OutOfStockToppings from './pages/manager/OutOfStockToppings'
import ServiceReviews from './pages/manager/ServiceReviews'

type Screen =
  | 'login'
  | 'otp'
  | 'home'
  | 'menu'
  | 'manage-menu'
  | 'oos-items'
  | 'oos-toppings'
  | 'service-reviews'

/** The manager area (served at /manager). Login-only for now: the same login +
 *  OTP screens as the customer app, but the login gates on does-manager-exist
 *  so only provisioned managers can get a code (no self sign-up). */
export default function ManagerApp() {
  // A returning manager with a saved token skips straight to the home screen;
  // ManagerHome re-validates the token actually belongs to a manager.
  // `screen` is kept in sync with browser history so Back / back-swipe moves
  // between screens instead of unloading the whole site.
  const { screen, navigate, goBack } = useScreen<Screen>(
    getToken() ? 'home' : 'login',
  )
  const [email, setEmail] = useState('')

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
          onVerified={() => navigate('home')}
        />
      )}

      {screen === 'home' && (
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
