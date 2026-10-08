import { useState } from 'react'
import './App.css'
import { getToken } from './api'
import { useScreen } from './useScreen'
import Login from './pages/Login'
import VerifyOtp from './pages/VerifyOtp'
import ManagerHome from './pages/ManagerHome'
import ManagerMenu from './pages/ManagerMenu'
import OutOfStockItems from './pages/OutOfStockItems'
import OutOfStockToppings from './pages/OutOfStockToppings'

type Screen = 'login' | 'otp' | 'home' | 'menu' | 'oos-items' | 'oos-toppings'

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

  return (
    <div className="app">
      {screen === 'login' && (
        <Login
          managerMode
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
          onViewOosItems={() => navigate('oos-items')}
          onViewOosToppings={() => navigate('oos-toppings')}
        />
      )}

      {screen === 'menu' && <ManagerMenu onBack={goBack} />}

      {screen === 'oos-items' && <OutOfStockItems onBack={goBack} />}

      {screen === 'oos-toppings' && <OutOfStockToppings onBack={goBack} />}
    </div>
  )
}
