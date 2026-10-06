import { useCallback, useEffect, useRef, useState } from 'react'
import { gameSocketUrl } from '../api'

interface Props {
  onBack: () => void
}

// Server-side board dimensions (see backend/app/routers/game.py).
const GRID_W = 44
const GRID_H = 44
const CELL = 11 // logical px per cell; the canvas is scaled to fit via CSS.
const BG = '#ffd9b3' // peach

interface PlayerState {
  id: string
  userId: number
  name: string
  first: string
  photo: string | null
  emoji: string
  color: string
  alive: boolean
  score: number
  body: number[][] // [[x,y], ...], head first
}

interface Snapshot {
  grid: { w: number; h: number }
  food: number[][]
  players: PlayerState[]
}

type Status = 'connecting' | 'open' | 'closed'

export default function SnakeGame({ onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map())

  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [youId, setYouId] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [showStatus, setShowStatus] = useState(false)
  const [labelId, setLabelId] = useState<string | null>(null)

  const me = snap?.players.find((p) => p.id === youId) ?? null

  // ---- WebSocket lifecycle ----
  useEffect(() => {
    const ws = new WebSocket(gameSocketUrl())
    wsRef.current = ws

    ws.onopen = () => setStatus('open')
    ws.onclose = () => setStatus('closed')
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'welcome') {
        setYouId(msg.you)
        setSnap({ grid: msg.grid, food: msg.food, players: msg.players })
      } else if (msg.type === 'state') {
        setSnap({ grid: msg.grid, food: msg.food, players: msg.players })
      }
    }

    return () => {
      ws.onclose = null
      ws.close()
    }
  }, [])

  const send = useCallback((payload: object) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload))
  }, [])

  const turn = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => send({ action: 'dir', dir }),
    [send],
  )

  // ---- Keyboard controls ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        w: 'up',
        s: 'down',
        a: 'left',
        d: 'right',
      }
      const dir = map[e.key]
      if (dir) {
        e.preventDefault()
        turn(dir)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [turn])

  // ---- Load snake-face images, redrawing once they arrive ----
  const getImage = useCallback((url: string): HTMLImageElement | null => {
    const cache = imgCache.current
    const existing = cache.get(url)
    if (existing) return existing.complete ? existing : null
    const img = new Image()
    img.src = url
    img.onload = () => setSnap((s) => (s ? { ...s } : s)) // force a redraw
    cache.set(url, img)
    return null
  }, [])

  // ---- Canvas rendering ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = GRID_W * CELL
    const h = GRID_H * CELL
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Peach board.
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)

    if (!snap) return

    // Fruits: little red apples.
    for (const [fx, fy] of snap.food) {
      const cx = fx * CELL + CELL / 2
      const cy = fy * CELL + CELL / 2
      ctx.fillStyle = '#e23b3b'
      ctx.beginPath()
      ctx.arc(cx, cy, CELL * 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#4caf50'
      ctx.fillRect(cx - 1, cy - CELL * 0.55, 2, CELL * 0.25)
    }

    // Snakes: bodies are rows of dots; the head wears the player's photo.
    for (const p of snap.players) {
      if (!p.alive || p.body.length === 0) continue
      ctx.fillStyle = p.color
      for (let i = 1; i < p.body.length; i++) {
        const [bx, by] = p.body[i]
        ctx.beginPath()
        ctx.arc(bx * CELL + CELL / 2, by * CELL + CELL / 2, CELL * 0.42, 0, Math.PI * 2)
        ctx.fill()
      }
      const [hx, hy] = p.body[0]
      const cx = hx * CELL + CELL / 2
      const cy = hy * CELL + CELL / 2
      const r = CELL * 0.62
      // Head disc in the snake's colour.
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      // Photo clipped into a circle, if loaded.
      const img = p.photo ? getImage(p.photo) : null
      if (img) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, r - 1, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2)
        ctx.restore()
        // Ring to separate the face from the board.
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        // No photo: draw the player's fallback emoji as the face.
        ctx.font = `${r * 1.5}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.emoji, cx, cy + 1)
      }
    }
  }, [snap, getImage])

  // ---- Tap a snake's face (not your own) to reveal its owner's name ----
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!snap) return
    const rect = e.currentTarget.getBoundingClientRect()
    const gx = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_W)
    const gy = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_H)
    let hit: string | null = null
    for (const p of snap.players) {
      if (p.id === youId || !p.alive || p.body.length === 0) continue
      const [hx, hy] = p.body[0]
      if (Math.abs(hx - gx) <= 1 && Math.abs(hy - gy) <= 1) {
        hit = p.id
        break
      }
    }
    setLabelId((prev) => (prev === hit ? null : hit))
  }

  // The floating name bubble tracks its snake's head every frame.
  const labelled =
    labelId != null ? snap?.players.find((p) => p.id === labelId && p.alive) : null
  const labelPos =
    labelled && labelled.body.length > 0
      ? {
          left: `${((labelled.body[0][0] + 0.5) / GRID_W) * 100}%`,
          top: `${(labelled.body[0][1] / GRID_H) * 100}%`,
        }
      : null

  const ranked = snap
    ? [...snap.players].sort((a, b) => b.score - a.score)
    : []

  return (
    <div className="screen snake-screen">
      <div className="snake-topbar">
        <button type="button" className="hdr-back" onClick={onBack} aria-label="Leave game">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="snake-score">
          Score <strong>{me?.score ?? 0}</strong>
        </div>
        <button type="button" className="ghost-btn sm" onClick={() => setShowStatus((v) => !v)}>
          View current status
        </button>
      </div>

      <div className="snake-board-wrap">
        <canvas
          ref={canvasRef}
          className="snake-canvas"
          onClick={handleCanvasClick}
        />
        {labelled && labelPos && (
          <div className="snake-name-bubble" style={labelPos}>
            {labelled.first}
          </div>
        )}

        {status === 'connecting' && (
          <div className="snake-veil">Connecting to the arena…</div>
        )}
        {status === 'closed' && (
          <div className="snake-veil">
            Disconnected.
            <button className="candy-btn btn-sun" onClick={onBack}>
              Back
            </button>
          </div>
        )}

        {me && !me.alive && status === 'open' && (
          <div className="snake-veil">
            <div className="snake-gameover">
              <h3>Game over</h3>
              <p>You scored <strong>{me.score}</strong></p>
              <div className="snake-gameover-actions">
                <button
                  className="candy-btn btn-sun"
                  onClick={() => send({ action: 'respawn' })}
                >
                  Play again
                </button>
                <button className="ghost-btn" onClick={onBack}>
                  Exit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="snake-hint">
        Arrow keys / WASD to steer. Tap another snake’s face to see who it is.
      </p>

      {/* On-screen controls for touch devices. */}
      <div className="dpad">
        <button className="dpad-btn up" onClick={() => turn('up')} aria-label="Up">▲</button>
        <button className="dpad-btn left" onClick={() => turn('left')} aria-label="Left">◀</button>
        <button className="dpad-btn right" onClick={() => turn('right')} aria-label="Right">▶</button>
        <button className="dpad-btn down" onClick={() => turn('down')} aria-label="Down">▼</button>
      </div>

      {showStatus && (
        <div className="sheet-overlay" onClick={() => setShowStatus(false)}>
          <div className="status-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Live players</h3>
            <ol className="status-list">
              {ranked.map((p) => (
                <li key={p.id} className={p.id === youId ? 'me' : ''}>
                  <span className="status-dot" style={{ background: p.color }} />
                  <span className="status-name">
                    {p.first}
                    {p.id === youId ? ' (you)' : ''}
                    {!p.alive ? ' — out' : ''}
                  </span>
                  <span className="status-score">{p.score}</span>
                </li>
              ))}
              {ranked.length === 0 && <li className="muted">No players yet.</li>}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
