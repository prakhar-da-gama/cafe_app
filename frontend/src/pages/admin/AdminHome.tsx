import { useEffect, useState } from 'react'
import { clearToken, getMe, type User } from '../../api'

interface Props {
  onSignedOut: () => void
  onManagerDashboard: () => void
  /** Open the admin-only menu authoring page (add categories, dishes, etc.). */
  onManageMenu: () => void
  /** Open a dummy placeholder screen for the not-yet-built tools. */
  onDummy: (title: string) => void
}

// The portal tiles. The manager dashboard and the admin-only "Add to menu"
// page are wired up; the rest are placeholders for tools that don't exist yet.
const TILES: {
  key: string
  title: string
  blurb: string
  candy: number
  dummy: boolean
}[] = [
  {
    key: 'manager',
    title: "Manager's dashboard",
    blurb: 'Orders & stock',
    candy: 1,
    dummy: false,
  },
  {
    key: 'add-menu',
    title: 'Add to menu',
    blurb: 'Categories, dishes & AI import',
    candy: 2,
    dummy: false,
  },
  {
    key: 'analytics',
    title: 'Analytics',
    blurb: 'Sales & order trends',
    candy: 3,
    dummy: true,
  },
  {
    key: 'blogs',
    title: 'Blogs & social',
    blurb: 'Explore the community',
    candy: 5,
    dummy: true,
  },
  {
    key: 'insights',
    title: 'Market insights',
    blurb: 'Trends & competition',
    candy: 6,
    dummy: true,
  },
  {
    key: 'cafe',
    title: 'My café analytics',
    blurb: 'A quick pulse check',
    candy: 8,
    dummy: true,
  },
]

/** The admin landing portal: confirms the session belongs to an admin, then
 *  offers the manager dashboard plus a set of (dummy) higher-level tools. */
export default function AdminHome({
  onSignedOut,
  onManagerDashboard,
  onManageMenu,
  onDummy,
}: Props) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let alive = true
    getMe()
      .then((u) => {
        if (!alive) return
        // Only admins may reach the admin portal.
        if (u.user_type !== 'admin') {
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
        <div className="hdr-actions">
          <span className="admin-badge">Admin</span>
        </div>
      </header>

      <div className="menu-head mgr-dash-head">
        <h1 className="menu-title">Admin console</h1>
        <p className="muted">Welcome back{user.name ? `, ${user.name}` : ''}.</p>
      </div>

      <div className="admin-tiles">
        {TILES.map((t) => (
          <button
            key={t.key}
            type="button"
            className="admin-tile"
            data-candy={t.candy}
            onClick={() => {
              if (t.dummy) onDummy(t.title)
              else if (t.key === 'add-menu') onManageMenu()
              else onManagerDashboard()
            }}
          >
            <span className="admin-tile-title">{t.title}</span>
            <span className="admin-tile-blurb">{t.blurb}</span>
            {t.dummy && <span className="admin-tile-soon">Soon</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
