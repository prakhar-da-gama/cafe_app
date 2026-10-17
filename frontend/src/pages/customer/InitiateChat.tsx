import { useEffect, useRef, useState } from 'react'
import { initiateChat } from '../../api'
import CafeHeader from '../../components/CafeHeader'
import vegSymbol from '../../assets/veg-symbol.svg'
import nonVegSymbol from '../../assets/non-veg-symbol.svg'

interface Props {
  onBack: () => void
  onViewMenu: () => void
  // Called once the chat session is created; receives the session id, the open
  // cart id, whether this is a brand-new session (vs a resumed one), and the
  // barista's generated opening turn (message + quick-action chips) to seed the
  // chat with. The opener is only shown for a new session.
  onReady: (
    chatContextId: number,
    cartId: number,
    newSession: boolean,
    firstMessage: string | null,
    firstOptions: string[] | null,
  ) => void
  // Called when the setup call has been running for more than 3s: the chat is
  // opened immediately on the barista's thinking dots, and `onReady` (or
  // `onPrepareError`) follows once the call finally lands.
  onPreparing: () => void
  // Called when a slow setup call ultimately failed *after* `onPreparing` had
  // already opened the chat, so the chat can show the error instead of spinning.
  onPrepareError: (message: string) => void
}

// Turn the adult/child counts into the free-text party description the backend
// stores on the chat context, e.g. "2 adults and 1 child".
function describeParty(adults: number, children: number): string {
  const parts: string[] = []
  if (adults > 0) parts.push(`${adults} adult${adults === 1 ? '' : 's'}`)
  if (children > 0) parts.push(`${children} child${children === 1 ? '' : 'ren'}`)
  return parts.join(' and ')
}

// Component-scoped styles. Kept inline so the whole experience — markup, logic
// and motion — lives in this one file. Reuses the app's existing candy palette.
const IC_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap');
.ic-root {
  position: relative;
  isolation: isolate;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  animation: ic-fade 0.5s ease both;
}
/* Full-screen candy wash: fixed to the viewport so the rainbow hue fills the
   whole phone, not just the centred app column. */
.ic-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(120% 68% at 50% -12%, rgba(255,111,181,.18), transparent 62%),
    radial-gradient(95% 60% at 100% 102%, rgba(82,224,176,.16), transparent 60%),
    radial-gradient(95% 62% at 0% 100%, rgba(176,107,245,.18), transparent 60%);
}
/* Ambient candy orbs drifting far behind the content, sized in vw so they
   scale to the real screen. */
.ic-orb {
  position: absolute;
  border-radius: 50%;
  aspect-ratio: 1;
  filter: blur(54px);
  opacity: 0.6;
  will-change: transform;
}
.ic-orb-1 {
  width: 70vw; max-width: 360px; top: -9vh; right: -16vw;
  background: radial-gradient(circle at 32% 30%, #ff9ecb, #ff6fb5);
  animation: ic-drift-1 15s ease-in-out infinite;
}
.ic-orb-2 {
  width: 66vw; max-width: 340px; bottom: -7vh; left: -18vw;
  background: radial-gradient(circle at 32% 30%, #d6a9ff, #b06bf5);
  animation: ic-drift-2 18s ease-in-out infinite;
}
.ic-orb-3 {
  width: 54vw; max-width: 280px; top: 40%; right: -14vw;
  background: radial-gradient(circle at 32% 30%, #8bead0, #52e0b0);
  animation: ic-drift-3 13s ease-in-out infinite;
}
@keyframes ic-drift-1 {
  0%,100% { transform: translate(0,0) scale(1); }
  50% { transform: translate(-26px,24px) scale(1.08); }
}
@keyframes ic-drift-2 {
  0%,100% { transform: translate(0,0) scale(1); }
  50% { transform: translate(28px,-22px) scale(1.1); }
}
@keyframes ic-drift-3 {
  0%,100% { transform: translate(0,0) scale(1); }
  50% { transform: translate(-20px,-26px) scale(1.12); }
}

.ic-stage {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 10px 2px 118px;
}

/* The greeting: a simple "Namaste" that types in at the top of the screen. */
.ic-greet-wrap {
  text-align: center;
  padding: 10px 4px 4px;
}
.ic-greet {
  margin: 0;
  /* Handwriting face, used only for this greeting line. */
  font-family: 'Caveat', 'Segoe Script', cursive;
  font-weight: 700;
  font-size: clamp(2.1rem, 9vw, 2.9rem);
  line-height: 1.15;
  letter-spacing: 0;
  color: var(--ink);
  text-wrap: balance;
}

.ic-cards { margin-top: 22px; }
.ic-card {
  background: var(--surface);
  border-radius: var(--radius);
  border: 1.5px solid #fff;
  box-shadow: 0 2px 0 rgba(255,111,181,.1), 0 18px 44px rgba(58,43,74,.13);
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: ic-rise 0.6s cubic-bezier(.22,1,.36,1) both;
}
.ic-q {
  margin: 0 0 4px;
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.38;
  color: var(--ink);
}
.ic-counters { display: flex; flex-direction: column; gap: 6px; }
.ic-counter-sep { height: 1px; background: var(--line); margin: 4px 0; }
/* Divider between the party-size block and the vegetarian block. */
.ic-group-sep { height: 1px; background: var(--line); margin: 2px 0; }
.ic-q-marks {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
  vertical-align: -5px;
}
.ic-mark { width: 20px; height: 20px; display: block; }
.ic-choices { display: flex; flex-direction: column; gap: 10px; }
.ic-veg-choice {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
}
.ic-veg-icon { width: 38px; height: 38px; display: block; }

@keyframes ic-rise {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: none; }
}
@keyframes ic-fade { from { opacity: 0; } to { opacity: 1; } }

.ic-dock { animation: ic-rise 0.5s cubic-bezier(.22,1,.36,1) both; }

@media (prefers-reduced-motion: reduce) {
  .ic-root, .ic-card, .ic-dock, .ic-orb { animation: none; }
}
`

interface TypedProps {
  text: string
  speed?: number
  startDelay?: number
  onDone?: () => void
  className?: string
}

/** Reveals `text` one character at a time (respecting reduced-motion) and
 *  fires `onDone` once the last character lands. */
function Typed({ text, speed = 32, startDelay = 0, onDone, className }: TypedProps) {
  const [count, setCount] = useState(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  // Reveal by code point, not UTF-16 unit, so emoji are never split mid-type.
  const units = Array.from(text)

  useEffect(() => {
    setCount(0)
    const len = Array.from(text).length
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setCount(len)
      const t = window.setTimeout(() => onDoneRef.current?.(), 0)
      return () => window.clearTimeout(t)
    }
    let interval = 0
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setCount((c) => {
          const next = c + 1
          if (next >= len) {
            window.clearInterval(interval)
            window.setTimeout(() => onDoneRef.current?.(), 0)
            return len
          }
          return next
        })
      }, speed)
    }, startDelay)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(interval)
    }
  }, [text, speed, startDelay])

  const done = count >= units.length
  return (
    <span className={className} aria-label={text}>
      {units.slice(0, count).join('')}
      <span className={done ? 'caret caret-rest' : 'caret'} aria-hidden="true" />
    </span>
  )
}

interface CounterProps {
  label: string
  value: number
  onChange: (next: number) => void
}

/** A labelled stepper with minus / value / plus; never goes below zero. */
function Counter({ label, value, onChange }: CounterProps) {
  return (
    <div className="counter-row">
      <span className="counter-label">{label}</span>
      <div className="counter">
        <button
          type="button"
          className="counter-btn"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          −
        </button>
        <span className="counter-value" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          className="counter-btn"
          onClick={() => onChange(value + 1)}
          aria-label={`More ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

const ARROW = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
    <path
      d="M5 12h14M13 6l6 6-6 6"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** The setup step before the barista chat opens: a simple "Namaste" types in at
 *  the top, then a single card asks for the party size (adults + children) and
 *  the vegetarian preference together. Proceed creates the session and hands the
 *  id up. */
export default function InitiateChat({
  onBack,
  onViewMenu,
  onReady,
  onPreparing,
  onPrepareError,
}: Props) {
  const [introDone, setIntroDone] = useState(false)

  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [vegOnly, setVegOnly] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const peopleReady = adults + children > 0
  const canSubmit = peopleReady && vegOnly !== null && !submitting

  async function proceed() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    // If the setup call runs long, open the chat immediately on the barista's
    // thinking dots after 3s rather than leaving the user on a spinning button;
    // onReady/onPrepareError then fill it in once the call lands.
    let openedEarly = false
    const slowTimer = setTimeout(() => {
      openedEarly = true
      onPreparing()
    }, 3000)

    try {
      const { chat_context_id, cart_id, resumed, first_message, first_options } =
        await initiateChat(describeParty(adults, children), vegOnly as boolean)
      clearTimeout(slowTimer)
      onReady(chat_context_id, cart_id, !resumed, first_message, first_options)
    } catch (e) {
      clearTimeout(slowTimer)
      const message = (e as Error).message
      if (openedEarly) {
        // The chat is already open on the thinking dots, so surface the error
        // there instead of on the (now-replaced) setup form.
        onPrepareError(message)
      } else {
        setError(message)
        setSubmitting(false)
      }
    }
  }

  return (
    <div className="ic-root">
      <style>{IC_CSS}</style>
      <div className="ic-bg" aria-hidden="true">
        <div className="ic-orb ic-orb-1" />
        <div className="ic-orb ic-orb-2" />
        <div className="ic-orb ic-orb-3" />
      </div>

      <CafeHeader onBack={onBack} onViewMenu={onViewMenu} />

      <div className="ic-stage">
        <div className="ic-greet-wrap">
          <p className="ic-greet">
            <Typed text="Namaste 🙏" speed={70} onDone={() => setIntroDone(true)} />
          </p>
        </div>

        <div className="ic-cards">
          {introDone && (
            <section className="ic-card">
              <div className="ic-counters">
                <h2 className="ic-q">How many guests are joining us today?</h2>
                <Counter label="Adults" value={adults} onChange={setAdults} />
                <div className="ic-counter-sep" />
                <Counter label="Children" value={children} onChange={setChildren} />
              </div>

              <div className="ic-group-sep" />

              <div>
                <h2 className="ic-q">
                  Vegetarian only, or both veg &amp; non-veg?
                  <span className="ic-q-marks">
                    <img src={vegSymbol} alt="" className="ic-mark" />
                    <img src={nonVegSymbol} alt="" className="ic-mark" />
                  </span>
                </h2>
                <div className="ic-choices">
                  <button
                    type="button"
                    className={
                      vegOnly === true
                        ? 'choice ic-veg-choice choice-on'
                        : 'choice ic-veg-choice'
                    }
                    onClick={() => setVegOnly(true)}
                    aria-pressed={vegOnly === true}
                    aria-label="Vegetarian only"
                  >
                    <img src={vegSymbol} alt="" className="ic-veg-icon" />
                  </button>
                  <button
                    type="button"
                    className={
                      vegOnly === false
                        ? 'choice ic-veg-choice choice-on'
                        : 'choice ic-veg-choice'
                    }
                    onClick={() => setVegOnly(false)}
                    aria-pressed={vegOnly === false}
                    aria-label="Both vegetarian and non-vegetarian"
                  >
                    <img src={vegSymbol} alt="" className="ic-veg-icon" />
                    <img src={nonVegSymbol} alt="" className="ic-veg-icon" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {error && <p className="form-error center">{error}</p>}
        </div>
      </div>

      {introDone && (
        <div className="initiate-dock ic-dock">
          <button
            type="button"
            className="candy-btn btn-mint initiate-next"
            onClick={proceed}
            disabled={!canSubmit}
          >
            {submitting ? 'Setting things up…' : 'Proceed'}
            {ARROW}
          </button>
        </div>
      )}
    </div>
  )
}
