import { useEffect, useRef, useState } from 'react'
import { initiateChat } from '../../api'
import CafeHeader from '../../components/CafeHeader'
import vegSymbol from '../../assets/veg-symbol.svg'
import nonVegSymbol from '../../assets/non-veg-symbol.svg'

interface Props {
  onBack: () => void
  onViewMenu: () => void
  // Called once the chat session is created; receives the session id and the
  // open cart id to carry forward.
  onProceed: (chatContextId: number, cartId: number) => void
}

type Phase = 'intro' | 'people' | 'veg'

// A warm, professional greeting chosen from the current time of day (computed
// on the client so it reflects the guest's own clock).
function greetingForNow(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
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
  padding: 6px 2px 118px;
}

/* Step pips — appear once the greeting has handed off. */
.ic-steps {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 2px 0 8px;
  animation: ic-fade 0.5s ease both;
}
.ic-dot {
  width: 8px; height: 8px;
  border-radius: 999px;
  background: var(--line);
  transition: width 0.4s cubic-bezier(.22,1,.36,1), background 0.4s;
}
.ic-dot-on { width: 24px; background: var(--candy-6); }

/* The greeting: types in the centre, then lifts and shrinks to the top. */
.ic-greet-wrap {
  text-align: center;
  padding: 2px 4px;
  transition: transform 0.95s cubic-bezier(.22,1,.36,1);
}
.ic-greet {
  margin: 0;
  font-weight: 800;
  font-size: clamp(1.55rem, 7.2vw, 2.15rem);
  line-height: 1.2;
  letter-spacing: -0.015em;
  color: var(--ink);
  transition: font-size 0.95s cubic-bezier(.22,1,.36,1);
  text-wrap: balance;
}
.ic-greet-wrap[data-up="true"] .ic-greet {
  font-size: clamp(1.1rem, 4.4vw, 1.35rem);
  color: var(--ink-soft);
}

.ic-cards { margin-top: 20px; }
.ic-card {
  background: var(--surface);
  border-radius: var(--radius);
  border: 1.5px solid #fff;
  box-shadow: 0 2px 0 rgba(255,111,181,.1), 0 18px 44px rgba(58,43,74,.13);
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: ic-rise 0.65s cubic-bezier(.22,1,.36,1) both;
}
.ic-card.ic-leaving { animation: ic-sink 0.42s ease forwards; }
.ic-q {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  line-height: 1.38;
  color: var(--ink);
  min-height: 1.5em;
}
.ic-counters { display: flex; flex-direction: column; gap: 6px; }
.ic-counter-sep { height: 1px; background: var(--line); margin: 4px 0; }
.ic-q-marks {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
  vertical-align: -5px;
  animation: ic-fade 0.4s ease both;
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
.ic-reveal { animation: ic-rise 0.55s cubic-bezier(.22,1,.36,1) both; }

@keyframes ic-rise {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: none; }
}
@keyframes ic-sink {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translateY(-18px) scale(.97); }
}
@keyframes ic-fade { from { opacity: 0; } to { opacity: 1; } }

.ic-dock { animation: ic-rise 0.5s cubic-bezier(.22,1,.36,1) both; }

@media (prefers-reduced-motion: reduce) {
  .ic-greet-wrap, .ic-greet { transition: none; }
  .ic-root, .ic-card, .ic-card.ic-leaving, .ic-reveal, .ic-dock, .ic-steps,
  .ic-orb {
    animation: none;
  }
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
 *  fires `onDone` once the last character lands — the hook that drives the
 *  staged reveals below. */
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

/** The setup step before the barista chat opens, played as a short sequence:
 *  the time-of-day greeting types in the centre, lifts to the top, then the
 *  party-size question reveals; on Next it fades out and the vegetarian
 *  question takes its place. Proceed creates the session and hands the id up. */
export default function InitiateChat({ onBack, onViewMenu, onProceed }: Props) {
  const [greeting] = useState(greetingForNow)
  const [phase, setPhase] = useState<Phase>('intro')
  const [movedUp, setMovedUp] = useState(false)
  const [peopleQDone, setPeopleQDone] = useState(false)
  const [peopleLeaving, setPeopleLeaving] = useState(false)
  const [vegQDone, setVegQDone] = useState(false)

  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [vegOnly, setVegOnly] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Once the greeting finishes typing, lift it up and bring in the first card.
  function onGreetingDone() {
    window.setTimeout(() => {
      setMovedUp(true)
      setPhase('people')
    }, 550)
  }

  // Fade the party card out, then swap in the vegetarian question.
  function goToVeg() {
    setPeopleLeaving(true)
    window.setTimeout(() => setPhase('veg'), 430)
  }

  const peopleReady = adults + children > 0
  const canSubmit = vegOnly !== null && !submitting

  async function proceed() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const { chat_context_id, cart_id } = await initiateChat(
        describeParty(adults, children),
        vegOnly as boolean,
      )
      onProceed(chat_context_id, cart_id)
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
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
        {phase !== 'intro' && (
          <div className="ic-steps" aria-hidden="true">
            <span className={phase === 'people' ? 'ic-dot ic-dot-on' : 'ic-dot'} />
            <span className={phase === 'veg' ? 'ic-dot ic-dot-on' : 'ic-dot'} />
          </div>
        )}

        <div
          className="ic-greet-wrap"
          data-up={movedUp ? 'true' : 'false'}
          style={{ transform: movedUp ? 'translateY(0)' : 'translateY(30vh)' }}
        >
          <p className="ic-greet">
            <Typed
              text={`Namaste 🙏 ${greeting}, and a warm welcome to Seoulmate Cafe.`}
              speed={34}
              onDone={onGreetingDone}
            />
          </p>
        </div>

        <div className="ic-cards">
          {phase === 'people' && (
            <section className={peopleLeaving ? 'ic-card ic-leaving' : 'ic-card'}>
              <h2 className="ic-q">
                <Typed
                  text="How many guests are joining us today?"
                  speed={26}
                  startDelay={500}
                  onDone={() => setPeopleQDone(true)}
                />
              </h2>
              {peopleQDone && (
                <div className="ic-counters ic-reveal">
                  <Counter label="Adults" value={adults} onChange={setAdults} />
                  <div className="ic-counter-sep" />
                  <Counter
                    label="Children"
                    value={children}
                    onChange={setChildren}
                  />
                </div>
              )}
            </section>
          )}

          {phase === 'veg' && (
            <section className="ic-card">
              <h2 className="ic-q">
                <Typed
                  text="Would you prefer vegetarian only, or both vegetarian and non-vegetarian?"
                  speed={24}
                  startDelay={320}
                  onDone={() => setVegQDone(true)}
                />
                {vegQDone && (
                  <span className="ic-q-marks">
                    <img src={vegSymbol} alt="" className="ic-mark" />
                    <img src={nonVegSymbol} alt="" className="ic-mark" />
                  </span>
                )}
              </h2>
              {vegQDone && (
                <div className="ic-choices ic-reveal">
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
              )}
            </section>
          )}

          {error && <p className="form-error center">{error}</p>}
        </div>
      </div>

      {phase === 'people' && peopleQDone && !peopleLeaving && (
        <div className="initiate-dock ic-dock">
          <button
            type="button"
            className="candy-btn btn-mint initiate-next"
            onClick={goToVeg}
            disabled={!peopleReady}
          >
            Next
            {ARROW}
          </button>
        </div>
      )}

      {phase === 'veg' && vegQDone && (
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
