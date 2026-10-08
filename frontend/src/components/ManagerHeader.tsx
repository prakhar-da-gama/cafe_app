interface Props {
  onBack?: () => void
}

/** Slim header for manager sub-pages: optional back arrow, brand, Manager tag. */
export default function ManagerHeader({ onBack }: Props) {
  return (
    <header className="cafe-header">
      <div className="brand">
        {onBack && (
          <button
            type="button"
            className="hdr-back"
            onClick={onBack}
            aria-label="Back"
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
          <span className="brand-name">Coffee Trading Co</span>
        </div>
      </div>
      <div className="hdr-actions">
        <span className="mgr-tag">Manager</span>
      </div>
    </header>
  )
}
