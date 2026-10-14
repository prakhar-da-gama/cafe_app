import { useState } from 'react'
import './App.css'
import { getActiveChatSession, getToken, type Tag } from './api'
import { useScreen } from './useScreen'
import Login from './pages/customer/Login'
import VerifyOtp from './pages/VerifyOtp'
import EnterName from './pages/customer/EnterName'
import DashboardCustomer from './pages/customer/DashboardCustomer'
import PersonalisedMenu from './pages/customer/PersonalisedMenu'
import FullMenu from './pages/customer/FullMenu'
import MyCart from './pages/customer/MyCart'
import MyOrders from './pages/customer/MyOrders'
import InitiateChat from './pages/customer/InitiateChat'
import BaristaChat from './pages/customer/BaristaChat'
import SnakeGame from './pages/customer/SnakeGame'
import GameStats from './pages/customer/GameStats'
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
  | 'initiate-chat'
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
  // The active barista chat session id and its open cart, set once Initiate
  // Chat creates them and carried into the chat interface for the session.
  const [chatContextId, setChatContextId] = useState<number | null>(null)
  const [chatCartId, setChatCartId] = useState<number | null>(null)
  // The Play button in the header opens the game lobby popup over any screen.
  const [showGamePopup, setShowGamePopup] = useState(false)
  const openCart = () => navigate('cart')
  const openOrders = () => navigate('orders')

  // Opening the barista chat: resume the existing session (skipping the setup
  // step) when one is active, otherwise run the InitiateChat setup flow.
  const openBaristaChat = async () => {
    try {
      const session = await getActiveChatSession()
      if (
        session.active &&
        session.chat_context_id !== null &&
        session.cart_id !== null
      ) {
        setChatContextId(session.chat_context_id)
        setChatCartId(session.cart_id)
        navigate('chat')
        return
      }
    } catch {
      /* fall through to the setup flow if the check fails */
    }
    navigate('initiate-chat')
  }

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
            // Replace the OTP entry so Back skips the (now-verified) OTP screen
            // and returns to the previous page instead.
            navigate(nameRequired ? 'name' : 'dashboard', { replace: true })
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
          onOpenChat={openBaristaChat}
          onPlay={() => setShowGamePopup(true)}
          onGoAhead={(chosen) => {
            setSelection(chosen)
            navigate('menu')
          }}
        />
      )}

      {screen === 'initiate-chat' && (
        <InitiateChat
          onBack={goBack}
          onViewMenu={() => navigate('fullmenu')}
          onProceed={(id, cart) => {
            setChatContextId(id)
            setChatCartId(cart)
            // Replace the setup step so Back from the chat returns to the
            // dashboard rather than re-opening the (already-answered) form.
            navigate('chat', { replace: true })
          }}
        />
      )}

      {screen === 'chat' && (
        <BaristaChat
          chatContextId={chatContextId}
          cartId={chatCartId}
          onBack={goBack}
          onViewMenu={() => navigate('fullmenu')}
          onEnded={() => {
            setChatContextId(null)
            setChatCartId(null)
            // The session is gone; replace the chat so Back skips it.
            navigate('dashboard', { replace: true })
          }}
        />
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
