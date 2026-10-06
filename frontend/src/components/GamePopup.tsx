import { useEffect, useRef, useState } from 'react'
import { getLiveCount, getMe, updateMyPhoto, uploadImage, type User } from '../api'

interface Props {
  onClose: () => void
  onViewStats: () => void
  onPlay: () => void
}

/**
 * The lobby popup shown when the user taps "Play" in the header.
 *
 * Shows how many people are currently in the room, asks for a photo (which
 * becomes the face on their snake) if they don't have one yet, and offers
 * "View stats" and the final "Play" action.
 */
export default function GamePopup({ onClose, onViewStats, onPlay }: Props) {
  const [me, setMe] = useState<User | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load the user once; poll the live player count while the popup is open.
  useEffect(() => {
    let alive = true
    getMe()
      .then((u) => alive && setMe(u))
      .catch(() => {})

    const tick = () =>
      getLiveCount()
        .then((c) => alive && setCount(c.count))
        .catch(() => {})
    tick()
    const id = setInterval(tick, 2500)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { path } = await uploadImage(file)
      const updated = await updateMyPhoto(path)
      setMe(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const hasPhoto = Boolean(me?.photo_path)

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="game-pop" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <h2 className="game-pop-title">
          <span className="play-dot" aria-hidden="true" /> Snake Arena
        </h2>

        <div className="game-pop-live">
          <span className="live-ping" aria-hidden="true" />
          {count === null
            ? 'Checking who’s around…'
            : count === 0
              ? 'No one is playing right now — be the first!'
              : `${count} ${count === 1 ? 'person is' : 'people are'} playing right now`}
        </div>

        <div className="game-pop-identity">
          <div className={hasPhoto ? 'id-avatar has' : 'id-avatar'}>
            {hasPhoto ? (
              <img src={me!.photo_path!} alt="Your snake face" />
            ) : (
              <span>🐍</span>
            )}
          </div>
          <div className="id-text">
            {hasPhoto ? (
              <>
                <strong>You’re ready!</strong>
                <span className="muted">This photo rides on your snake’s head.</span>
              </>
            ) : (
              <>
                <strong>Give your snake a face (optional)</strong>
                <span className="muted">
                  No photo? You’ll get a random emoji face instead.
                </span>
              </>
            )}
            <button
              type="button"
              className="id-upload"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : hasPhoto ? 'Change photo' : 'Upload photo'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFile}
            />
          </div>
        </div>

        {error && <p className="form-error center">{error}</p>}

        <div className="game-pop-actions">
          <button type="button" className="ghost-btn" onClick={onViewStats}>
            View stats
          </button>
          <button
            type="button"
            className="candy-btn btn-sun game-pop-play"
            onClick={onPlay}
          >
            Play
          </button>
        </div>
      </div>
    </div>
  )
}
