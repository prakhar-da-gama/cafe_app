import { useEffect, useRef, useState } from 'react'
import { initiateChat } from '../../api'
import CafeHeader from '../../components/CafeHeader'

interface Props {
  onBack: () => void
  onViewMenu: () => void
  // Called once the chat session is created; receives the id to carry forward.
  onProceed: (chatContextId: number) => void
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
  overflow: hidden;
}
/* Ambient candy orbs drifting far behind the content. */
.ic-orb {
  position: absolute;
  z-index: 0;
  border-radius: 50%;
  filter: blur(46px);
  opacity: 0.55;
  pointer-events: none;
  will-change: transform;
}
.ic-orb-1 {
  width: 260px; height: 260px; top: -70px; right: -80px;
  background: radial-gradient(circle at 32% 30%, #ff9ecb, #ff6fb5);
  animation: ic-drift-1 15s ease-in-out infinite;
}
.ic-orb-2 {
  width: 240px; height: 240px; bottom: 30px; left: -90px;
  background: radial-gradient(circle at 32% 30%, #d6a9ff, #b06bf5);
  animation: ic-drift-2 18s ease-in-out infinite;
}
.ic-orb-3 {
  width: 190px; height: 190px; top: 42%; right: -60px;
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
.ic-choices { display: flex; flex-direction: column; gap: 10px; }
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
  .ic-card, .ic-card.ic-leaving, .ic-reveal, .ic-dock, .ic-steps, .ic-orb {
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

  useEffect(() => {
    setCount(0)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setCount(text.length)
      const t = window.setTimeout(() => onDoneRef.current?.(), 0)
      return () => window.clearTimeout(t)
    }
    let interval = 0
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setCount((c) => {
          const next = c + 1
          if (next >= text.length) {
            window.clearInterval(interval)
            window.setTimeout(() => onDoneRef.current?.(), 0)
            return text.length
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

  const done = count >= text.length
  return (
    <span className={className} aria-label={text}>
      {text.slice(0, count)}
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
      const { chat_context_id } = await initiateChat(
        describeParty(adults, children),
        vegOnly as boolean,
      )
      onProceed(chat_context_id)
    } catch (e) {
      setError((e as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="screen ic-root">
      <style>{IC_CSS}</style>
      <div className="ic-orb ic-orb-1" aria-hidden="true" />
      <div className="ic-orb ic-orb-2" aria-hidden="true" />
      <div className="ic-orb ic-orb-3" aria-hidden="true" />

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
              text={`${greeting}, and a warm welcome to Seoulmate Cafe.`}
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
              </h2>
              {vegQDone && (
                <div className="ic-choices ic-reveal">
                  <button
                    type="button"
                    className={vegOnly === true ? 'choice choice-on' : 'choice'}
                    onClick={() => setVegOnly(true)}
                    aria-pressed={vegOnly === true}
                  >
                    Vegetarian only
                  </button>
                  <button
                    type="button"
                    className={vegOnly === false ? 'choice choice-on' : 'choice'}
                    onClick={() => setVegOnly(false)}
                    aria-pressed={vegOnly === false}
                  >
                    Both vegetarian &amp; non-vegetarian
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
