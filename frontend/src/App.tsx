import { useState } from 'react'
import './App.css'
import { getToken, type Tag } from './api'
import Login from './pages/Login'
import VerifyOtp from './pages/VerifyOtp'
import EnterName from './pages/EnterName'
import DashboardCustomer from './pages/DashboardCustomer'
import PersonalisedMenu from './pages/PersonalisedMenu'
import FullMenu from './pages/FullMenu'
import BaristaChat from './pages/BaristaChat'

type Screen =
  | 'login'
  | 'otp'
  | 'name'
  | 'dashboard'
  | 'menu'
  | 'fullmenu'
  | 'chat'

function App() {
  // A returning visitor with a saved token skips straight to the dashboard.
  const [screen, setScreen] = useState<Screen>(() =>
    getToken() ? 'dashboard' : 'login',
  )
  const [email, setEmail] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [selection, setSelection] = useState<Tag[]>([])

  return (
    <div className="app">
      {screen === 'login' && (
        <Login
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
          onVerified={(nameRequired) =>
            setScreen(nameRequired ? 'name' : 'dashboard')
          }
        />
      )}

      {screen === 'name' && (
        <EnterName
          onDone={(n) => {
            setName(n)
            setScreen('dashboard')
          }}
        />
      )}

      {screen === 'dashboard' && (
        <DashboardCustomer
          greetingName={name}
          onViewMenu={() => setScreen('fullmenu')}
          onOpenChat={() => setScreen('chat')}
          onGoAhead={(chosen) => {
            setSelection(chosen)
            setScreen('menu')
          }}
        />
      )}

      {screen === 'chat' && (
        <BaristaChat
          onBack={() => setScreen('dashboard')}
          onViewMenu={() => setScreen('fullmenu')}
        />
      )}

      {screen === 'menu' && (
        <PersonalisedMenu
          selection={selection}
          onBack={() => setScreen('dashboard')}
          onViewMenu={() => setScreen('fullmenu')}
        />
      )}

      {screen === 'fullmenu' && (
        <FullMenu onBack={() => setScreen('dashboard')} />
      )}
    </div>
  )
}

export default App
