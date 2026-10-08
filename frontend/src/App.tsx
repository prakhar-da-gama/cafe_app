import { useState } from 'react'
import './App.css'
import { getToken, type Tag } from './api'
import { useScreen } from './useScreen'
import Login from './pages/Login'
import VerifyOtp from './pages/VerifyOtp'
import EnterName from './pages/EnterName'
import DashboardCustomer from './pages/DashboardCustomer'
import PersonalisedMenu from './pages/PersonalisedMenu'
import FullMenu from './pages/FullMenu'
import MyCart from './pages/MyCart'
import MyOrders from './pages/MyOrders'
import BaristaChat from './pages/BaristaChat'
import SnakeGame from './pages/SnakeGame'
import GameStats from './pages/GameStats'
import GamePopup from './components/GamePopup'

type Screen =
  | 'login'
  | 'otp'
  | 'name'
  | 'dashboard'
  | 'menu'
  | 'fullmenu'
  | 'cart'
  | 'orders'
  | 'chat'
  | 'game'
  | 'gamestats'

function App() {
  // A returning visitor with a saved token skips straight to the dashboard.
  // `screen` is kept in sync with browser history so Back / back-swipe moves
  // between screens instead of unloading the whole site.
  const { screen, navigate, goBack } = useScreen<Screen>(
    getToken() ? 'dashboard' : 'login',
  )
  const [email, setEmail] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [selection, setSelection] = useState<Tag[]>([])
  // The Play button in the header opens the game lobby popup over any screen.
  const [showGamePopup, setShowGamePopup] = useState(false)
  const openCart = () => navigate('cart')
  const openOrders = () => navigate('orders')

  return (
    <div className="app">
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
          onVerified={(nameRequired) =>
            navigate(nameRequired ? 'name' : 'dashboard')
          }
        />
      )}

      {screen === 'name' && (
        <EnterName
          onDone={(n) => {
            setName(n)
            navigate('dashboard')
          }}
        />
      )}

      {screen === 'dashboard' && (
        <DashboardCustomer
          greetingName={name}
          onViewMenu={() => navigate('fullmenu')}
          onOpenChat={() => navigate('chat')}
          onPlay={() => setShowGamePopup(true)}
          onGoAhead={(chosen) => {
            setSelection(chosen)
            navigate('menu')
          }}
        />
      )}

      {screen === 'chat' && (
        <BaristaChat onBack={goBack} onViewMenu={() => navigate('fullmenu')} />
      )}

      {screen === 'menu' && (
        <PersonalisedMenu
          selection={selection}
          onBack={goBack}
          onViewMenu={() => navigate('fullmenu')}
          onOpenCart={openCart}
          onOpenOrders={openOrders}
        />
      )}

      {screen === 'fullmenu' && (
        <FullMenu
          onBack={goBack}
          onOpenCart={openCart}
          onOpenOrders={openOrders}
        />
      )}

      {screen === 'cart' && (
        <MyCart
          onBack={goBack}
          onViewMenu={() => navigate('fullmenu')}
          onOpenOrders={openOrders}
          onPlaced={() => {
            // The cart is now empty, so replace it in history: Back from Orders
            // should skip the empty cart and return to whatever preceded it.
            navigate('orders', { replace: true })
          }}
        />
      )}

      {screen === 'orders' && (
        <MyOrders
          initialStatus="pending"
          onBack={goBack}
          onViewMenu={() => navigate('fullmenu')}
        />
      )}

      {screen === 'game' && <SnakeGame onBack={goBack} />}

      {screen === 'gamestats' && <GameStats onBack={goBack} />}

      {showGamePopup && (
        <GamePopup
          onClose={() => setShowGamePopup(false)}
          onViewStats={() => {
            setShowGamePopup(false)
            navigate('gamestats')
          }}
          onPlay={() => {
            setShowGamePopup(false)
            navigate('game')
          }}
        />
      )}
    </div>
  )
}

export default App
