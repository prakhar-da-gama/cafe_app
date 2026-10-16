import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  endChat,
  getChatTranscript,
  sendChatMessage,
  type ChatItems,
} from '../../api'
import InchatMenu from './chatbot/InchatMenu'
import InchatMCQ from './chatbot/InchatMCQ'

interface Props {
  // The chat session id and open cart from /initiate-chat; scope the barista
  // calls (/message, and the resumed transcript) to this session.
  chatContextId: number | null
  cartId: number | null
  // Whether this is a brand-new session (seed the generated opener below and
  // skip the transcript preload) or a resumed one (replay the transcript, no
  // opener). Authoritative — comes from the /initiate-chat `resumed` flag.
  isNewSession: boolean
  // The barista's generated opening turn for a brand-new session (from
  // /initiate-chat): the greeting text. Null when a session is resumed — the
  // opener is then replayed from the transcript.
  firstMessage: string | null
  // The opener's quick-action chips (first-person utterances the guest can tap);
  // rendered below the opening message as the in-chat MCQ. Null on resume.
  firstOptions: string[] | null
  // Recover the session when a /message call fails because its chat context is
  // gone (ended elsewhere, DB reset, …). Returns the user's current active
  // session ids so the chat can retry transparently, or null if there's no
  // active session to resume.
  onRecoverSession: () => Promise<{ chatContextId: number; cartId: number } | null>
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
  // A barista turn's quick-action chips, rendered as an in-chat MCQ below the
  // text; tapping one sends its exact text as the customer's next message.
  options?: string[] | null
  // Set on a freshly-arrived barista reply so its text types out character by
  // character. Preloaded/greeting turns render instantly.
  animate?: boolean
}

// Reveals `text` one character at a time for a typewriter effect. Calls
// `onTick` after each character so the log can keep the latest text in view.
function TypingText({ text, onTick }: { text: string; onTick?: () => void }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setShown(0)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setShown(i)
      onTick?.()
      if (i >= text.length) window.clearInterval(id)
    }, 18)
    return () => window.clearInterval(id)
  }, [text])
  return <>{text.slice(0, shown)}</>
}

// Fallback greeting shown only when there's no generated opener and nothing to
// resume (e.g. the opener failed to generate server-side).
const GREETING: Msg = {
  id: 0,
  from: 'barista',
  text: "Hi, I'm your barista. Tell me what you're craving and I'll find your drink.",
}

// The barista's generated opening turn, as a single chat message (greeting text
// + the quick-action chips).
function openerMsg(text: string | null, options: string[] | null): Msg {
  return {
    id: 0,
    from: 'barista',
    text: text ?? undefined,
    options,
    animate: true,
  }
}

export default function BaristaChat({
  chatContextId,
  cartId,
  isNewSession,
  firstMessage,
  firstOptions,
  onRecoverSession,
  onBack,
  onViewMenu,
  onEnded,
}: Props) {
  // The live session ids. Seeded from the props but able to move on when a
  // stale session is recovered mid-chat (see send()), so subsequent turns use
  // the fresh ids without re-mounting.
  const [sessionCtxId, setSessionCtxId] = useState(chatContextId)
  const [sessionCartId, setSessionCartId] = useState(cartId)
  useEffect(() => {
    setSessionCtxId(chatContextId)
    setSessionCartId(cartId)
  }, [chatContextId, cartId])
  // For a brand-new session, seed with the barista's generated opener (text +
  // quick-action chips). For a resumed session, start on the fallback greeting
  // until the transcript preload (below) loads over it.
  const [messages, setMessages] = useState<Msg[]>(() =>
    isNewSession && (firstMessage || firstOptions)
      ? [openerMsg(firstMessage, firstOptions)]
      : [GREETING],
  )
  const [value, setValue] = useState('')
  const [typing, setTyping] = useState(false)
  const [listening, setListening] = useState(false)
  const [ending, setEnding] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  // Also seed the opener from an effect, not just the initial state. The opener
  // props can land just after mount (set alongside the navigation) and, in dev,
  // a hot-reload preserves the old message state while skipping the initializer
  // — this makes the generated greeting show in both cases. The opener props are
  // fixed for a session's lifetime, so this runs once per session and never
  // clobbers an ongoing conversation.
  useEffect(() => {
    if (isNewSession && (firstMessage || firstOptions)) {
      setMessages([openerMsg(firstMessage, firstOptions)])
    }
  }, [isNewSession, firstMessage, firstOptions])

  // Preload any existing turns so an in-progress chat continues where it left
  // off. The transcript omits item suggestions, so replayed turns are plain
  // bubbles; the greeting is only shown when there's nothing to resume. Skipped
  // for a brand-new session — its only turn is the opener we already seeded
  // above (with its item suggestions, which the transcript endpoint strips).
  useEffect(() => {
    if (chatContextId === null || isNewSession) return
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
  }, [chatContextId, isNewSession])

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

  // Deliver one turn, recovering a stale session once if the context is gone.
  // When /message 404s with "No chat context …" the session was torn down (ended
  // elsewhere, DB reset, …) while this tab kept the old id; ask the parent for
  // the user's current active session and retry with the fresh ids. Throws a
  // sentinel 'session-expired' when there's no active session left to resume.
  async function deliver(ctxId: number, cartIdArg: number, text: string) {
    try {
      return await sendChatMessage(ctxId, cartIdArg, text)
    } catch (e) {
      if (!/no chat context/i.test((e as Error).message)) throw e
      const recovered = await onRecoverSession()
      if (!recovered) throw new Error('session-expired')
      setSessionCtxId(recovered.chatContextId)
      setSessionCartId(recovered.cartId)
      return await sendChatMessage(recovered.chatContextId, recovered.cartId, text)
    }
  }

  async function send(text: string) {
    const clean = text.trim()
    if (!clean || sessionCtxId === null || sessionCartId === null) return
    setMessages((m) => [...m, { id: Date.now(), from: 'you', text: clean }])
    setValue('')
    setTyping(true)
    try {
      const reply = await deliver(sessionCtxId, sessionCartId, clean)
      const replyText = reply['llm response']
      setTyping(false)
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          from: 'barista',
          text: replyText ?? undefined,
          items: reply.items_json,
          animate: true,
        },
      ])
    } catch (e) {
      setTyping(false)
      const expired = (e as Error).message === 'session-expired'
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          from: 'barista',
          text: expired
            ? 'This chat session has ended. Tap back and start a new chat to keep ordering.'
            : `Sorry — something went wrong. ${(e as Error).message}`,
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

  // Leave the chat immediately and clear the session server-side in the
  // background — the user shouldn't wait on /end-chat (preference distilling)
  // to finish. Both the Back button and the End chat button end the session;
  // they differ only in where they go afterwards (Back to the previous screen,
  // End chat to the dashboard).
  function endSession(after: () => void) {
    if (ending) return
    setEnding(true)
    // Fire-and-forget; even if distilling preferences failed the session is
    // cleared, and we've already left the screen.
    void endChat().catch(() => {})
    after()
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
            onClick={() => endSession(onBack)}
            disabled={ending}
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
          onClick={() => endSession(onEnded)}
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
              {m.text && (
                <div className="bubble bubble-barista">
                  {m.animate ? (
                    <TypingText
                      text={m.text}
                      onTick={() =>
                        endRef.current?.scrollIntoView({ behavior: 'smooth' })
                      }
                    />
                  ) : (
                    m.text
                  )}
                </div>
              )}
              {m.options && m.options.length > 0 && (
                <InchatMCQ options={m.options} onSelect={(text) => send(text)} />
              )}
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
