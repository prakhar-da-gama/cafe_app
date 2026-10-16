import { useEffect, useState } from 'react'
import {
  clearToken,
  getMe,
  getServiceRatingSummary,
  listNotifications,
  type ServiceRatingSummary,
  type User,
} from '../../api'
import ManagerOrders from './ManagerOrders'
import StarRating from '../../components/StarRating'

interface Props {
  onSignedOut: () => void
  onViewMenu: () => void
  onViewOosItems: () => void
  onViewOosToppings: () => void
  onViewServiceReviews: () => void
  onViewServiceAnalysis: () => void
  onViewNotifications: () => void
}

/** The manager dashboard shell: confirms the session belongs to a manager
 *  (bouncing non-managers who arrive with a customer token), then renders the
 *  orders dashboard under a slim header. */
export default function ManagerHome({
  onSignedOut,
  onViewMenu,
  onViewOosItems,
  onViewOosToppings,
  onViewServiceReviews,
  onViewServiceAnalysis,
  onViewNotifications,
}: Props) {
  const [user, setUser] = useState<User | null>(null)
  const [serviceRating, setServiceRating] = useState<ServiceRatingSummary | null>(
    null,
  )
  const [unresolved, setUnresolved] = useState(0)
  // Rapid mode: fast received → ready workflow (see ManagerOrders).
  const [rapidMode, setRapidMode] = useState(false)

  useEffect(() => {
    getServiceRatingSummary()
      .then(setServiceRating)
      .catch(() => {
        /* the rating badge is non-critical; ignore failures */
      })
    // The bell's unread count: how many open manager notifications there are.
    listNotifications('manager', false, 1, 1)
      .then((res) => setUnresolved(res.total))
      .catch(() => {
        /* non-critical */
      })
  }, [])

  useEffect(() => {
    let alive = true
    getMe()
      .then((u) => {
        if (!alive) return
        // A customer token must not unlock the manager area. Admins may view it
        // too (they sit above managers).
        if (u.user_type !== 'manager' && u.user_type !== 'admin') {
          clearToken()
          onSignedOut()
          return
        }
        setUser(u)
      })
      .catch(() => {
        clearToken()
        onSignedOut()
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = () => {
    clearToken()
    onSignedOut()
  }

  if (!user) {
    return (
      <div className="screen screen-center">
        <p className="hero-sub">Signing you in…</p>
      </div>
    )
  }

  return (
    <div className="screen menu-screen mgr-screen">
      <header className="cafe-header mgr-dash-header">
        <div className="brand">
          <div className="brand-stack">
            <span className="brand-name">Seoulmate Cafe</span>
            <button type="button" className="hdr-logout" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
        {/* All dashboard actions on one row under the cafe name, with the
            service rating anchored to the end. */}
        <div className="hdr-actions mgr-dash-actions-row">
          <button type="button" className="menu-btn" onClick={onViewMenu}>
            Manage stocks
          </button>
          <button type="button" className="menu-btn" onClick={onViewOosItems}>
            Out of Stock items
          </button>
          <button type="button" className="menu-btn" onClick={onViewOosToppings}>
            Out of stock toppings
          </button>
          <button type="button" className="menu-btn" onClick={onViewServiceAnalysis}>
            Service analysis
          </button>
          <button
            type="button"
            className="notif-bell"
            onClick={onViewNotifications}
            aria-label="Notifications"
            title="Notifications"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path
                d="M6 9a6 6 0 0 1 12 0c0 5 1.5 6.5 2 7H4c.5-.5 2-2 2-7z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 20a2 2 0 0 0 4 0"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {unresolved > 0 && (
              <span className="notif-bell-badge">
                {unresolved > 99 ? '99+' : unresolved}
              </span>
            )}
          </button>
          <button
            type="button"
            className="service-rating-badge mgr-dash-service"
            onClick={onViewServiceReviews}
            title="View service reviews"
          >
            <StarRating
              value={serviceRating?.average_rating ?? 0}
              size={16}
              label="Average service rating"
            />
            <span className="service-rating-label">
              ({serviceRating?.rating_count ?? 0})
            </span>
          </button>
        </div>
      </header>

      <div className="menu-head mgr-dash-head">
        <h1 className="menu-title">Orders</h1>
        <button
          type="button"
          className={rapidMode ? 'rapid-toggle rapid-on' : 'rapid-toggle'}
          onClick={() => setRapidMode((v) => !v)}
          aria-pressed={rapidMode}
          title="Skip straight from received to ready"
        >
          <span className="rapid-switch" aria-hidden />
          Rapid mode
        </button>
      </div>

      <ManagerOrders rapidMode={rapidMode} />
    </div>
  )
}
