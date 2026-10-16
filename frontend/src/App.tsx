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
  // Whether the chat being opened is a brand-new session (show the generated
  // opener below) or a resumed one (replay the transcript, no opener items).
  const [chatIsNewSession, setChatIsNewSession] = useState(false)
  // The barista's generated opening message for a brand-new session, handed from
  // InitiateChat to seed the chat. Null when a session is resumed — the opener
  // is then replayed from the transcript.
  const [chatFirstMessage, setChatFirstMessage] = useState<string | null>(null)
  // The opener's quick-action chips (first-person utterances the guest can tap),
  // handed from InitiateChat to seed the chat's in-chat MCQ. Null on resume.
  const [chatFirstOptions, setChatFirstOptions] = useState<string[] | null>(null)
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
        // Resuming: no fresh opener — the chat replays it from the transcript.
        setChatIsNewSession(false)
        setChatFirstMessage(null)
        setChatFirstItems(null)
        setChatFirstOptions(null)
        navigate('chat')
        return
      }
    } catch {
      /* fall through to the setup flow if the check fails */
    }
    navigate('initiate-chat')
  }

  // Recover the barista session after a /message call fails because its chat
  // context no longer exists (e.g. the session was ended in another tab, or the
  // DB was reset while this tab kept the old id). Asks the backend for the
  // user's current active session (which also repairs a missing cart) and, if
  // one exists, adopts its ids so the chat can retry transparently. Returns the
  // fresh ids, or null when there's no active session to resume.
  const recoverChatSession = async (): Promise<{
    chatContextId: number
    cartId: number
  } | null> => {
    try {
      const session = await getActiveChatSession()
      if (
        session.active &&
        session.chat_context_id !== null &&
        session.cart_id !== null
      ) {
        setChatContextId(session.chat_context_id)
        setChatCartId(session.cart_id)
        return {
          chatContextId: session.chat_context_id,
          cartId: session.cart_id,
        }
      }
    } catch {
      /* no recovery possible — fall through to null */
    }
    return null
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
          onOpenCart={openCart}
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
          onProceed={(id, cart, newSession, firstMessage, firstOptions) => {
            setChatContextId(id)
            setChatCartId(cart)
            setChatIsNewSession(newSession)
            setChatFirstMessage(firstMessage)
            setChatFirstOptions(firstOptions)
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
          isNewSession={chatIsNewSession}
          firstMessage={chatFirstMessage}
          firstOptions={chatFirstOptions}
          onRecoverSession={recoverChatSession}
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
          initialStatus="received"
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
