import { useRef, useState } from 'react'
import { reviewOrderItem, uploadImage, type OrderLine } from '../api'
import StarRating from './StarRating'

interface Props {
  line: OrderLine
  /** Bubble the saved values up so the parent list stays in sync. */
  onSaved: (changes: {
    rating: number | null
    review: string | null
    review_photo_paths: string[]
  }) => void
}

/** Inline reviewer for one line of a completed order: a star rating, a note,
 *  and photo uploads. Collapses to a compact summary once a review exists,
 *  with an "Edit" affordance to reopen the form. Built mobile-first. */
export default function OrderItemReview({ line, onSaved }: Props) {
  const hasReview =
    line.rating != null ||
    !!line.review ||
    (line.review_photo_paths?.length ?? 0) > 0

  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState<number>(line.rating ?? 0)
  const [text, setText] = useState<string>(line.review ?? '')
  const [photos, setPhotos] = useState<string[]>(line.review_photo_paths ?? [])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const addPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      const uploaded = await Promise.all(
        Array.from(files).map((f) => uploadImage(f)),
      )
      setPhotos((prev) => [...prev, ...uploaded.map((u) => u.path)])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removePhoto = (path: string) =>
    setPhotos((prev) => prev.filter((p) => p !== path))

  const save = async () => {
    if (rating === 0 && !text.trim() && photos.length === 0) {
      setError('Add a rating, a note, or a photo first.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const changes = {
        rating: rating || null,
        review: text.trim() || null,
        review_photo_paths: photos,
      }
      await reviewOrderItem(line.id, changes)
      onSaved(changes)
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Collapsed summary (a review exists and the editor isn't open).
  if (hasReview && !open) {
    return (
      <div className="line-review line-review-done">
        <div className="line-review-summary">
          {line.rating != null && (
            <StarRating value={line.rating} size={16} label="Your rating" />
          )}
          <button
            type="button"
            className="link-btn line-review-edit"
            onClick={() => setOpen(true)}
          >
            Edit review
          </button>
        </div>
        {line.review && <p className="line-review-text">“{line.review}”</p>}
        {line.review_photo_paths.length > 0 && (
          <div className="line-review-photos">
            {line.review_photo_paths.map((p) => (
              <img key={p} src={p} alt="Review" loading="lazy" />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Prompt to open the editor (no review yet, editor closed).
  if (!open) {
    return (
      <div className="line-review">
        <button
          type="button"
          className="candy-btn btn-sun line-review-open"
          onClick={() => setOpen(true)}
        >
          ★ Rate this item
        </button>
      </div>
    )
  }

  // The editor form.
  return (
    <div className="line-review line-review-form">
      <div className="line-review-stars">
        <span className="opt-label">Your rating</span>
        <StarRating value={rating} onChange={setRating} size={30} />
      </div>

      <textarea
        className="review-textarea"
        placeholder="How was it? (optional)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
      />

      <div className="review-photos">
        {photos.map((p) => (
          <div key={p} className="review-photo-thumb">
            <img src={p} alt="Upload" />
            <button
              type="button"
              className="review-photo-remove"
              onClick={() => removePhoto(p)}
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
          onChange={(e) => addPhotos(e.target.files)}
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
          {saving ? 'Saving…' : 'Save review'}
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
