import { useEffect, useRef, useState } from 'react'
import CafeHeader from '../../components/CafeHeader'

interface Props {
  onBack: () => void
  onViewMenu: () => void
}

interface Msg {
  id: number
  from: 'you' | 'barista'
  text: string
}

const GREETING: Msg = {
  id: 0,
  from: 'barista',
  text: "Hi, I'm your barista. Tell me what you're craving and I'll find your drink.",
}

export default function BaristaChat({ onBack, onViewMenu }: Props) {
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [value, setValue] = useState('')
  const [typing, setTyping] = useState(false)
  const [listening, setListening] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  function send(text: string) {
    const clean = text.trim()
    if (!clean) return
    setMessages((m) => [...m, { id: Date.now(), from: 'you', text: clean }])
    setValue('')
    setTyping(true)
    // Dummy barista — a canned reply stands in for the real assistant.
    window.setTimeout(() => {
      setTyping(false)
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          from: 'barista',
          text: "I'm still warming up the espresso machine — live answers are brewing soon.",
        },
      ])
    }, 1200)
  }

  function toggleMic() {
    setListening(true)
    window.setTimeout(() => {
      setListening(false)
      send('What do you recommend today?')
    }, 1400)
  }

  return (
    <div className="screen chat-screen">
      <CafeHeader onBack={onBack} onViewMenu={onViewMenu} />

      <div className="chat-log">
        {messages.map((m) => (
          <div key={m.id} className={m.from === 'you' ? 'bubble bubble-you' : 'bubble bubble-barista'}>
            {m.text}
          </div>
        ))}
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
