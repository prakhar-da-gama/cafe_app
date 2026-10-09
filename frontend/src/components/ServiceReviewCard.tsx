import { useEffect, useRef, useState } from 'react'
import {
  createServiceReview,
  getServiceReviewForOrder,
  updateServiceReview,
  uploadImage,
  type ServiceReview,
} from '../api'
import StarRating from './StarRating'

interface Props {
  orderId: number
}

/** Overall "rate our service" block shown on a completed order. Loads any
 *  existing service review, lets the customer set a star rating plus an
 *  optional note and photos, and creates or updates it. Mobile-first. */
export default function ServiceReviewCard({ orderId }: Props) {
  const [existing, setExisting] = useState<ServiceReview | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    getServiceReviewForOrder(orderId)
      .then((r) => {
        if (!alive) return
        setExisting(r)
        if (r) {
          setRating(r.rating)
          setText(r.review ?? '')
          setImages(r.review_images ?? [])
        }
      })
      .catch(() => {
        /* a missing review shouldn't block the page */
      })
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [orderId])

  const addImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const uploaded = await Promise.all(
        Array.from(files).map((f) => uploadImage(f)),
      )
      setImages((prev) => [...prev, ...uploaded.map((u) => u.path)])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeImage = (path: string) =>
    setImages((prev) => prev.filter((p) => p !== path))

  const save = async () => {
    if (rating === 0) {
      setError('Please pick a star rating for the service.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const payload = {
        rating,
        review: text.trim() || null,
        review_images: images,
      }
      const saved = existing
        ? await updateServiceReview(existing.id, payload)
        : await createServiceReview({ order_id: orderId, ...payload })
      setExisting(saved)
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  // Collapsed state: a prompt, or a summary of the saved service review.
  if (!open) {
    return (
      <div className="service-review">
        <div className="service-review-head">
          <span className="service-review-label">Service rating</span>
          {existing ? (
            <StarRating value={existing.rating} size={18} label="Service" />
          ) : (
            <span className="muted">Not rated yet</span>
          )}
          <button
            type="button"
            className="link-btn"
            onClick={() => setOpen(true)}
          >
            {existing ? 'Edit' : 'Rate service'}
          </button>
        </div>
        {existing?.review && (
          <p className="line-review-text">“{existing.review}”</p>
        )}
        {existing && existing.review_images.length > 0 && (
          <div className="line-review-photos">
            {existing.review_images.map((p) => (
              <img key={p} src={p} alt="Service review" loading="lazy" />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="service-review service-review-form">
      <span className="service-review-label">How was our service?</span>
      <StarRating value={rating} onChange={setRating} size={32} />

      <textarea
        className="review-textarea"
        placeholder="Tell us about your experience (optional)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
      />

      <div className="review-photos">
        {images.map((p) => (
          <div key={p} className="review-photo-thumb">
            <img src={p} alt="Upload" />
            <button
              type="button"
              className="review-photo-remove"
              onClick={() => removeImage(p)}
              aria-label="Remove photo"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="review-photo-add"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '…' : '+'}
          <span>{uploading ? 'Uploading' : 'Photo'}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => addImages(e.target.files)}
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="line-review-actions">
        <button
          type="button"
          className="candy-btn btn-mint"
          onClick={save}
          disabled={saving || uploading}
        >
          {saving ? 'Saving…' : 'Save service rating'}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
