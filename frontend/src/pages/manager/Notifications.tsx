import { useCallback, useEffect, useState } from 'react'
import {
  listNotifications,
  resolveNotification,
  type AppNotification,
} from '../../api'
import ManagerHeader from '../../components/ManagerHeader'

interface Props {
  onBack: () => void
}

const PAGE_SIZE = 20

// The resolved filter, mapped to the `resolved` query param the API accepts.
type Filter = 'unresolved' | 'resolved' | 'all'
const RESOLVED_PARAM: Record<Filter, boolean | undefined> = {
  unresolved: false,
  resolved: true,
  all: undefined,
}
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'unresolved', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
]

/** Manager page: the manager's notifications, newest first, with a resolved
 *  filter and a tick button to mark one resolved. Opened from the dashboard
 *  bell. Filtering + pagination are done at the DB level by the API. */
export default function Notifications({ onBack }: Props) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [filter, setFilter] = useState<Filter>('unresolved')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (next: number, f: Filter) => {
      setLoading(true)
      setError(null)
      try {
        const res = await listNotifications(
          'manager',
          RESOLVED_PARAM[f],
          next,
          PAGE_SIZE,
        )
        setItems((prev) => (next === 1 ? res.items : [...prev, ...res.items]))
        setPage(res.page)
        setHasMore(res.has_more)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    load(1, filter)
  }, [load, filter])

  const resolve = async (id: number) => {
    try {
      await resolveNotification(id)
      // Drop it from the "Open" view; otherwise just flip its flag in place.
      setItems((prev) =>
        filter === 'unresolved'
          ? prev.filter((n) => n.id !== id)
          : prev.map((n) => (n.id === id ? { ...n, resolved: true } : n)),
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="screen menu-screen mgr-screen">
      <ManagerHeader onBack={onBack} />

      <div className="menu-head">
        <h1 className="menu-title">Notifications</h1>
        <div className="notif-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`notif-filter${filter === f.key ? ' is-active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="form-error center">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="muted center">Nothing here.</p>
      )}

      <ul className="notif-list">
        {items.map((n) => (
          <li
            key={n.id}
            className={`notif-item${n.resolved ? ' is-resolved' : ''}`}
          >
            <div className="notif-body">
              <p className="notif-text">{n.notification_text}</p>
              <span className="notif-when">
                {new Date(n.created_at).toLocaleString()}
              </span>
            </div>
            {n.resolved ? (
              <span className="notif-done" aria-label="Resolved">
                ✓
              </span>
            ) : (
              <button
                type="button"
                className="notif-tick"
                onClick={() => resolve(n.id)}
                aria-label="Mark resolved"
                title="Mark resolved"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                  <path
                    d="M5 12.5l4.5 4.5L19 7"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>

      {loading && <p className="muted center">Loading…</p>}
      {!loading && hasMore && (
        <button
          type="button"
          className="candy-btn btn-grape load-more"
          onClick={() => load(page + 1, filter)}
        >
          Load more
        </button>
      )}
    </div>
  )
}
