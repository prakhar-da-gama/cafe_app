import { useCallback, useEffect, useState } from 'react'
import { listServiceReviews, type ServiceReview } from '../api'
import StarRating from './StarRating'

interface Props {
  onClose: () => void
}

const PAGE_SIZE = 10

/** A modal with the paginated list of overall service reviews, newest first,
 *  headed by the average rating. Opened from the manager dashboard. */
export default function ServiceReviewsPanel({ onClose }: Props) {
  const [reviews, setReviews] = useState<ServiceReview[]>([])
  const [average, setAverage] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (next: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await listServiceReviews(next, PAGE_SIZE)
      setReviews((prev) => (next === 1 ? res.items : [...prev, ...res.items]))
      setAverage(res.average_rating)
      setTotal(res.total)
      setPage(res.page)
      setHasMore(res.has_more)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(1)
  }, [load])

  // Close on Escape and lock page scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet service-reviews-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Service reviews"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="sheet-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="service-reviews-head">
          <h2 className="sheet-name">Service reviews</h2>
          <div className="item-reviews-avg">
            <StarRating value={average ?? 0} size={20} label="Average service rating" />
            <span className="item-reviews-avg-num">
              {average != null ? average.toFixed(1) : '—'}
            </span>
            <span className="muted">({total})</span>
          </div>
        </div>

        <div className="service-reviews-body">
          {error && <p className="form-error center">{error}</p>}
          {!loading && !error && reviews.length === 0 && (
            <p className="muted center">No service reviews yet.</p>
          )}

          <ul className="item-reviews-list">
            {reviews.map((r) => (
              <li key={r.id} className="item-review">
                <div className="item-review-top">
                  <StarRating value={r.rating} size={14} />
                  <span className="item-review-when">
                    Order #{r.order_id} ·{' '}
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                {r.review && <p className="item-review-text">{r.review}</p>}
                {r.review_images.length > 0 && (
                  <div className="line-review-photos">
                    {r.review_images.map((p) => (
                      <img key={p} src={p} alt="Service review" loading="lazy" />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {loading && <p className="muted center">Loading…</p>}
          {!loading && hasMore && (
            <button
              type="button"
              className="candy-btn btn-grape load-more"
              onClick={() => load(page + 1)}
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
