import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  endChat,
  getChatTranscript,
  sendChatMessage,
  type ChatItems,
} from '../../api'
import InchatMenu from './chatbot/InchatMenu'

interface Props {
  // The chat session id and open cart from /initiate-chat; scope the barista
  // calls (/message, and the resumed transcript) to this session.
  chatContextId: number | null
  cartId: number | null
  onBack: () => void
  onViewMenu: () => void
  // Called once the session has been ended server-side, so the app can leave
  // the chat screen.
  onEnded: () => void
}

interface Msg {
  id: number
  from: 'you' | 'barista'
  // The text bubble for this turn (optional — an item-only barista turn has none).
  text?: string
  // A barista turn's suggested items, rendered as an in-chat menu table.
  items?: ChatItems | null
}

const GREETING: Msg = {
  id: 0,
  from: 'barista',
  text: "Hi, I'm your barista. Tell me what you're craving and I'll find your drink.",
}

export default function BaristaChat({
  chatContextId,
  cartId,
  onBack,
  onViewMenu,
  onEnded,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [value, setValue] = useState('')
  const [typing, setTyping] = useState(false)
  const [listening, setListening] = useState(false)
  const [ending, setEnding] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  // Preload any existing turns so an in-progress chat continues where it left
  // off. The transcript omits item suggestions, so replayed turns are plain
  // bubbles; the greeting is only shown when there's nothing to resume.
  useEffect(() => {
    if (chatContextId === null) return
    let cancelled = false
    getChatTranscript(chatContextId)
      .then((entries) => {
        if (cancelled) return
        const preloaded = entries
          .filter((e) => e.content && e.content.trim())
          .map((e, i) => ({
            id: i + 1,
            from: e.role === 'user' ? ('you' as const) : ('barista' as const),
            text: e.content as string,
          }))
        if (preloaded.length > 0) setMessages(preloaded)
      })
      .catch(() => {
        /* a failed preload just leaves the greeting in place */
      })
    return () => {
      cancelled = true
    }
  }, [chatContextId])

  // --- Keyboard handling (the ChatGPT-mobile approach) ---------------------
  // A sticky composer inside a 100dvh column makes the browser scroll the whole
  // page up when the keyboard opens, carrying the first message off the top.
  // Instead, pin the chat to the *visual* viewport (which shrinks to sit above
  // the keyboard) and let only the message log scroll, so every message stays
  // reachable and only the composer rides up with the keyboard.
  const [viewport, setViewport] = useState(() => {
    const v = window.visualViewport
    return v ? { height: v.height, offsetTop: v.offsetTop, width: v.width } : null
  })

  useEffect(() => {
    const v = window.visualViewport
    if (!v) return
    const update = () =>
      setViewport({ height: v.height, offsetTop: v.offsetTop, width: v.width })
    update()
    v.addEventListener('resize', update)
    v.addEventListener('scroll', update)
    return () => {
      v.removeEventListener('resize', update)
      v.removeEventListener('scroll', update)
    }
  }, [])

  // Only phones get the pinned layout; the desktop framed strip is left as is.
  const pinned = viewport && viewport.width < 500 ? viewport : null
  const isPinned = Boolean(pinned)

  // While pinned, stop the page behind the chat from scrolling so focusing the
  // input can't drag the conversation out of view.
  useEffect(() => {
    if (!isPinned) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isPinned])

  // Keep the latest message in view — on new messages, the typing indicator,
  // and whenever the keyboard resizes the visual viewport.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing, viewport?.height])

  const screenStyle: CSSProperties = pinned
    ? {
        position: 'fixed',
        top: 0,
        left: '50%',
        width: '100%',
        maxWidth: 460,
        height: `${pinned.height}px`,
        minHeight: 0,
        transform: `translate(-50%, ${pinned.offsetTop}px)`,
        overflow: 'hidden',
        paddingLeft: 18,
        paddingRight: 18,
        boxSizing: 'border-box',
      }
    : {}

  // On phones the log becomes the only scroll area; the composer stays put.
  const logStyle: CSSProperties = pinned
    ? { flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 16 }
    : {}

  async function send(text: string) {
    const clean = text.trim()
    if (!clean || chatContextId === null || cartId === null) return
    setMessages((m) => [...m, { id: Date.now(), from: 'you', text: clean }])
    setValue('')
    setTyping(true)
    try {
      const reply = await sendChatMessage(chatContextId, cartId, clean)
      const replyText = reply['llm response']
      setTyping(false)
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          from: 'barista',
          text: replyText ?? undefined,
          items: reply.items_json,
        },
      ])
    } catch (e) {
      setTyping(false)
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          from: 'barista',
          text: `Sorry — something went wrong. ${(e as Error).message}`,
        },
      ])
    }
  }

  function toggleMic() {
    setListening(true)
    window.setTimeout(() => {
      setListening(false)
      send('What do you recommend today?')
    }, 1400)
  }

  async function handleEndChat() {
    if (ending) return
    setEnding(true)
    try {
      await endChat()
    } catch {
      /* even if distilling preferences failed, the session is cleared */
    } finally {
      onEnded()
    }
  }

  return (
    <div
      className={pinned ? 'chat-screen' : 'screen chat-screen'}
      style={screenStyle}
      data-chat-context-id={chatContextId ?? undefined}
    >
      <header className="cafe-header chat-header">
        <div className="chat-header-left">
          <button
            type="button"
            className="hdr-back"
            onClick={onBack}
            aria-label="Go back"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button type="button" className="menu-btn" onClick={onViewMenu}>
            View full menu
          </button>
        </div>
        <button
          type="button"
          className="end-chat-btn"
          onClick={handleEndChat}
          disabled={ending}
        >
          {ending ? 'Ending…' : 'End chat'}
        </button>
      </header>

      <div className="chat-log" style={logStyle}>
        {messages.map((m) => {
          if (m.from === 'you') {
            return (
              <div key={m.id} className="bubble bubble-you">
                {m.text}
              </div>
            )
          }
          // A barista turn: the suggested-items table (if any) first, then the
          // natural-language reply below it — rendered as if the barista replied
          // with both the component and a message.
          return (
            <div key={m.id} className="barista-turn">
              {m.items && m.items.categories.length > 0 && (
                <InchatMenu items={m.items} />
              )}
              {m.text && <div className="bubble bubble-barista">{m.text}</div>}
            </div>
          )
        })}
        {typing && (
          <div className="bubble bubble-barista bubble-typing" aria-label="Barista is typing">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault()
          send(value)
        }}
      >
        <input
          className="composer-input"
          placeholder="Message the barista"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className={listening ? 'mic-btn mic-listening' : 'mic-btn'}
          onClick={toggleMic}
          aria-label="Use voice"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path
              d="M6 11a6 6 0 0 0 12 0M12 17v3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="submit"
          className="send-btn"
          disabled={!value.trim()}
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
    </div>
  )
}
