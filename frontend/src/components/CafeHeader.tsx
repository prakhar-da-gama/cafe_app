interface Props {
  onViewMenu?: () => void
  menuActive?: boolean
  onBack?: () => void
}

/** Shared header: optional back button, brand name, "View full menu" action. */
export default function CafeHeader({ onViewMenu, menuActive, onBack }: Props) {
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
        <span className="brand-name">Coffee Trading Co</span>
      </div>
      <button
        type="button"
        className={menuActive ? 'menu-btn menu-btn-active' : 'menu-btn'}
        onClick={onViewMenu}
      >
        View full menu
      </button>
    </header>
  )
}
