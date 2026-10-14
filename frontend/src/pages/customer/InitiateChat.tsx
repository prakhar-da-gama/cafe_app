import { useMemo, useState } from 'react'
import { initiateChat } from '../../api'
import CafeHeader from '../../components/CafeHeader'

interface Props {
  onBack: () => void
  onViewMenu: () => void
  // Called once the chat session is created; receives the id to carry forward.
  onProceed: (chatContextId: number) => void
}

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

/** The setup step shown before the barista chat opens: a time-of-day greeting,
 *  the party size (adults / children steppers) and a vegetarian preference. On
 *  proceed it creates the chat session and hands the id back up. */
export default function InitiateChat({ onBack, onViewMenu, onProceed }: Props) {
  const greeting = useMemo(greetingForNow, [])
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [vegOnly, setVegOnly] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canProceed = adults + children > 0 && vegOnly !== null && !submitting

  async function proceed() {
    if (!canProceed) return
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
    <div className="screen initiate">
      <CafeHeader onBack={onBack} onViewMenu={onViewMenu} />

      <div className="initiate-body">
        <p className="initiate-greet">
          {greeting}, and a warm welcome to Seoulmate Cafe.
        </p>
        <p className="initiate-lede">
          Just a couple of quick details and your barista will be ready for you.
        </p>

        <section className="initiate-card">
          <h2 className="initiate-q">How many guests are joining us today?</h2>
          <Counter label="Adults" value={adults} onChange={setAdults} />
          <Counter label="Children" value={children} onChange={setChildren} />
        </section>

        <section className="initiate-card">
          <h2 className="initiate-q">
            Would you prefer vegetarian only, or both vegetarian and
            non-vegetarian?
          </h2>
          <div className="initiate-choices">
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
        </section>

        {error && <p className="form-error center">{error}</p>}
      </div>

      <div className="initiate-dock">
        <button
          type="button"
          className="candy-btn btn-mint initiate-next"
          onClick={proceed}
          disabled={!canProceed}
        >
          {submitting ? 'Setting things up…' : 'Proceed'}
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
      </div>
    </div>
  )
}
