import { useRef, useState } from 'react'
import { sendOtp, setToken, verifyOtp } from '../api'

interface Props {
  email: string
  onVerified: (nameRequired: boolean) => void
  onBack: () => void
}

const LEN = 6

export default function VerifyOtp({ email, onVerified, onBack }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const code = digits.join('')

  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, '')
    if (!clean) {
      setDigits((d) => d.map((x, idx) => (idx === i ? '' : x)))
      return
    }
    setDigits((d) => {
      const next = [...d]
      // Support pasting several digits at once.
      for (let k = 0; k < clean.length && i + k < LEN; k++) {
        next[i + k] = clean[k]
      }
      return next
    })
    const land = Math.min(i + clean.length, LEN - 1)
    refs.current[land]?.focus()
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus()
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== LEN) return
    setBusy(true)
    setError(null)
    try {
      const res = await verifyOtp(email, code)
      setToken(res.access_token)
      onVerified(res.name_required)
    } catch (err) {
      setError((err as Error).message)
      setDigits(Array(LEN).fill(''))
      refs.current[0]?.focus()
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      await sendOtp(email)
      setResent(true)
      window.setTimeout(() => setResent(false), 2500)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="screen screen-center">
      <button type="button" className="back-link" onClick={onBack}>
        ‹ Change email
      </button>

      <h1 className="hero-title small">Check your inbox</h1>
      <p className="hero-sub">
        We sent a 6-digit code to <strong>{email}</strong>
      </p>

      <div className="card">
        <form onSubmit={submit} className="stack">
          <div className="otp-row">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el
                }}
                className={d ? 'otp-box otp-filled' : 'otp-box'}
                inputMode="numeric"
                maxLength={LEN}
                value={d}
                autoFocus={i === 0}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
              />
            ))}
          </div>

          {error && <p className="form-error">{error}</p>}

          <button
            type="submit"
            className="candy-btn btn-grape"
            disabled={busy || code.length !== LEN}
          >
            {busy ? 'Verifying…' : 'Verify code'}
          </button>
        </form>
      </div>

      <button type="button" className="ghost-link" onClick={resend}>
        {resent ? 'New code sent' : "Didn't get it? Resend"}
      </button>
    </div>
  )
}
