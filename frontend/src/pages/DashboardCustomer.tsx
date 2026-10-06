import { useEffect, useState } from 'react'
import { listTags, type Tag } from '../api'
import CafeHeader from '../components/CafeHeader'
import ChatBar from '../components/ChatBar'
import TypingText from '../components/TypingText'

interface Props {
  greetingName: string | null
  onViewMenu: () => void
  onOpenChat: () => void
  onGoAhead: (selected: Tag[]) => void
}

const CANDY_COUNT = 8
// The API may return any number of tags; never show more than this.
const MAX_TAGS = 25

export default function DashboardCustomer({
  greetingName,
  onViewMenu,
  onOpenChat,
  onGoAhead,
}: Props) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Ordered: a tag's candy colour comes from its position here.
  const [selected, setSelected] = useState<number[]>([])

  useEffect(() => {
    let alive = true
    listTags()
      .then((t) => alive && setTags(t.slice(0, MAX_TAGS)))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  function toggle(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function candyIndex(id: number): number {
    return (selected.indexOf(id) % CANDY_COUNT) + 1
  }

  const chosen = selected
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => Boolean(t))

  return (
    <div className="screen dash">
      <CafeHeader onViewMenu={onViewMenu} />

      <ChatBar onOpen={onOpenChat} />

      <div className="dash-hero">
        {greetingName && <p className="dash-greet">Hi {greetingName}</p>}
        <h1 className="dash-title">
          <TypingText text="What should my order look like?" speed={45} />
        </h1>
      </div>

      {loading && <p className="muted center">Gathering today's flavours…</p>}
      {error && <p className="form-error center">{error}</p>}

      <div className="tag-cloud">
        {tags.map((t, i) => {
          const on = selected.includes(t.id)
          return (
            <button
              type="button"
              key={t.id}
              className={on ? 'tag-bubble tag-on' : 'tag-bubble'}
              data-candy={on ? candyIndex(t.id) : undefined}
              style={{ ['--i']: i } as React.CSSProperties}
              onClick={() => toggle(t.id)}
              aria-pressed={on}
            >
              {on && (
                <span className="tag-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              )}
              {t.tag}
            </button>
          )
        })}
      </div>

      <div className="go-dock">
        <div className="go-count">
          {chosen.length > 0
            ? `${chosen.length} flavour${chosen.length === 1 ? '' : 's'} picked`
            : 'Pick your flavours'}
        </div>
        <button
          type="button"
          className="candy-btn go-btn btn-sun"
          onClick={() => onGoAhead(chosen)}
          disabled={chosen.length === 0}
        >
          Go ahead
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
