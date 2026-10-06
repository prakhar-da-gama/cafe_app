import { useState } from 'react'
import { updateMyName } from '../api'

interface Props {
  onDone: (name: string) => void
}

export default function EnterName({ onDone }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    setBusy(true)
    setError(null)
    try {
      const user = await updateMyName(clean)
      onDone(user.name ?? clean)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen screen-center">
      <div className="wave" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none">
          <path
            d="M7 13c0-3 2-6 5-6s5 3 5 6M4 13h16"
            stroke="#b06bf5"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M8 13v3a4 4 0 0 0 8 0v-3" stroke="#ff6fb5" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <h1 className="hero-title small">One last thing</h1>
      <p className="hero-sub">What should we call you?</p>

      <div className="card">
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span className="field-label">Your name</span>
            <input
              type="text"
              required
              autoFocus
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex"
              className="text-input"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="candy-btn btn-mint" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Enter the cafe'}
          </button>
        </form>
      </div>
    </div>
  )
}
