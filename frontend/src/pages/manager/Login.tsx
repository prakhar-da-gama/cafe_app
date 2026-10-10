import { useState } from 'react'
import { doesManagerExist, sendOtp } from '../../api'

interface Props {
  onSent: (email: string) => void
}

export default function Login({ onSent }: Props) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const addr = email.trim()
      // Managers can't self-register: only send a code if the account exists
      // with the manager role.
      const { exists } = await doesManagerExist(addr)
      if (!exists) {
        throw new Error('No manager account found for this email.')
      }
      await sendOtp(addr)
      onSent(addr)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen screen-center">
      <h1 className="hero-title">Seoulmate Cafe</h1>
      <p className="hero-sub">Manager login</p>

      <div className="card auth-card">
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@coffee.com"
              className="text-input"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="candy-btn btn-sun" disabled={busy || !email}>
            {busy ? 'Sending code…' : 'Send me a code'}
          </button>
        </form>
      </div>

      <p className="fine-print">
        Managers only. We'll email a one-time code to your inbox.
      </p>
    </div>
  )
}
