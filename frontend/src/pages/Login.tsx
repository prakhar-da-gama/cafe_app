import { useState } from 'react'
import { doesManagerExist, sendOtp } from '../api'

interface Props {
  onSent: (email: string) => void
  /** Manager login: gate OTP behind a does-manager-exist check (no sign-up). */
  managerMode?: boolean
}

export default function Login({ onSent, managerMode = false }: Props) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const addr = email.trim()
      // Managers can't self-register: only send a code if the account exists.
      if (managerMode) {
        const { exists } = await doesManagerExist(addr)
        if (!exists) {
          throw new Error('No manager account found for this email.')
        }
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
      <h1 className="hero-title">Coffee Trading Co</h1>
      <p className="hero-sub">
        {managerMode ? 'Manager login' : 'Log in or sign up to continue'}
      </p>

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
        {managerMode
          ? "Managers only. We'll email a one-time code to your inbox."
          : "We'll text a one-time code to your inbox. No passwords, ever."}
      </p>
    </div>
  )
}
