import { clearToken } from '../api'

interface Props {
  onViewMenu?: () => void
  menuActive?: boolean
  onBack?: () => void
  onPlay?: () => void
}

/** Shared header: optional back button, brand name, Play + "View full menu". */
export default function CafeHeader({ onViewMenu, menuActive, onBack, onPlay }: Props) {
  // Frontend-only logout: drop the JWT and reload back to the login screen.
  const handleLogout = () => {
    clearToken()
    window.location.reload()
  }

  return (
    <header className="cafe-header">
      <div className="brand">
        {onBack && (
          <button
            type="button"
            className="hdr-back"
            onClick={onBack}
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
        )}
        <div className="brand-stack">
          <span className="brand-name">Seoulmate Cafe</span>
          <button type="button" className="hdr-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
      <div className="hdr-actions">
        {onPlay && (
          <button type="button" className="play-btn" onClick={onPlay}>
            <span className="play-dot" aria-hidden="true" />
            Play
          </button>
        )}
        <button
          type="button"
          className={menuActive ? 'menu-btn menu-btn-active' : 'menu-btn'}
          onClick={onViewMenu}
        >
          View full menu
        </button>
      </div>
    </header>
  )
}
