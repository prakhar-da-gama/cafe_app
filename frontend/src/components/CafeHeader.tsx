import { redirectToLogin } from '../api'

interface Props {
  onViewMenu?: () => void
  menuActive?: boolean
  onBack?: () => void
  onPlay?: () => void
  onOpenCart?: () => void
}

/** Shared header: optional back button, brand name, Play + "Menu" + cart. */
export default function CafeHeader({ onViewMenu, menuActive, onBack, onPlay, onOpenCart }: Props) {
  // Frontend-only logout: drop the JWT and reload back to the login screen.
  const handleLogout = () => {
    redirectToLogin()
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
          Menu
        </button>
        {onOpenCart && (
          <button
            type="button"
            className="cart-btn"
            onClick={onOpenCart}
            aria-label="View cart"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path
                d="M4 5h2l1.6 10.3a1.5 1.5 0 0 0 1.5 1.3h7.4a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6.4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
              <circle cx="17" cy="20" r="1.4" fill="currentColor" />
            </svg>
            <span className="cart-dot" aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  )
}
