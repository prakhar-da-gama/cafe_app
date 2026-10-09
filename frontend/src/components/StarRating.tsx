interface Props {
  /** Current rating, 0–5 (may be fractional for read-only averages). */
  value: number
  /** Omit to render a static display; provide to make the stars tappable. */
  onChange?: (value: number) => void
  /** Star size in px. */
  size?: number
  /** Accessible label for the group. */
  label?: string
}

const STARS = [1, 2, 3, 4, 5]

function Star({ fill, size }: { fill: number; size: number }) {
  // `fill` is 0–1 for this star (supports half/partial for averages). A clipped
  // overlay paints the filled portion over a hollow base.
  const id = `star-${Math.random().toString(36).slice(2)}`
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="star-svg">
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={24 * fill} height="24" />
        </clipPath>
      </defs>
      <path
        className="star-base"
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.06 1.1-6.47L2.6 9.9l6.5-.95L12 2.5z"
      />
      <path
        className="star-fill"
        clipPath={`url(#${id})`}
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.06 1.1-6.47L2.6 9.9l6.5-.95L12 2.5z"
      />
    </svg>
  )
}

/** A 0–5 star rating. Interactive when `onChange` is supplied (tap to set,
 *  tap the same star again to clear), otherwise a static display that supports
 *  fractional values for averages. */
export default function StarRating({
  value,
  onChange,
  size = 28,
  label = 'Rating',
}: Props) {
  const interactive = typeof onChange === 'function'

  return (
    <div
      className={interactive ? 'star-rating is-interactive' : 'star-rating'}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={interactive ? label : `${label}: ${value} out of 5`}
    >
      {STARS.map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)))
        if (!interactive) return <Star key={n} fill={fill} size={size} />
        return (
          <button
            key={n}
            type="button"
            className={'star-btn' + (n <= value ? ' is-on' : '')}
            onClick={() => onChange!(n === value ? 0 : n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={n <= value}
          >
            <Star fill={n <= value ? 1 : 0} size={size} />
          </button>
        )
      })}
    </div>
  )
}
