interface Props {
  title: string
  onBack: () => void
}

/** A simple placeholder for admin tools that aren't built yet. */
export default function ComingSoon({ title, onBack }: Props) {
  return (
    <div className="screen screen-center">
      <button type="button" className="back-link" onClick={onBack}>
        ‹ Back
      </button>
      <h1 className="hero-title small">{title}</h1>
      <p className="hero-sub">This tool is coming soon.</p>
      <div className="card auth-card">
        <p className="muted center">
          We're still building {title.toLowerCase()}. Check back later!
        </p>
      </div>
    </div>
  )
}
