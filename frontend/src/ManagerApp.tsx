import { useState } from 'react'
import './App.css'
import { getToken } from './api'
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
  const [screen, setScreen] = useState<Screen>(() =>
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
            setScreen('otp')
          }}
        />
      )}

      {screen === 'otp' && (
        <VerifyOtp
          email={email}
          onBack={() => setScreen('login')}
          onVerified={() => setScreen('home')}
        />
      )}

      {screen === 'home' && (
        <ManagerHome
          onSignedOut={() => setScreen('login')}
          onViewMenu={() => setScreen('menu')}
          onViewOosItems={() => setScreen('oos-items')}
          onViewOosToppings={() => setScreen('oos-toppings')}
        />
      )}

      {screen === 'menu' && <ManagerMenu onBack={() => setScreen('home')} />}

      {screen === 'oos-items' && (
        <OutOfStockItems onBack={() => setScreen('home')} />
      )}

      {screen === 'oos-toppings' && (
        <OutOfStockToppings onBack={() => setScreen('home')} />
      )}
    </div>
  )
}
