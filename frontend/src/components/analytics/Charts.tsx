// Small, dependency-free SVG/HTML chart primitives for the admin analytics
// page. Mark specs follow one system: 2px lines, ≤24px bars with a 4px rounded
// data end, hairline solid grids, a 10% area wash, hover tooltips everywhere,
// and text that always wears ink tokens (never the series colour).

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

// ---- Formatting ----

const inrFull = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const numCompact = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const numFull = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })

/** ₹ — compact (₹1.2L) from ₹1 lakh up, otherwise exact (₹8,450). */
export const inr = (v: number) => (Math.abs(v) >= 100000 ? inrCompact : inrFull).format(v)
export const inrExact = (v: number) => inrFull.format(v)
export const num = (v: number) => (Math.abs(v) >= 10000 ? numCompact : numFull).format(v)
export const pct = (v: number) => `${numFull.format(v)}%`

export type Fmt = (v: number) => string

// ---- Layout helpers ----

/** Track an element's content width (charts redraw to fit their card). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** Round an axis maximum up to a clean 1/2/2.5/5 × 10ⁿ step. */
function niceMax(v: number, ticks = 4): { max: number; step: number } {
  if (v <= 0) return { max: ticks, step: 1 }
  const raw = v / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  return { max: step * ticks, step }
}

/** Absolutely-positioned tooltip, kept inside its chart box horizontally. */
function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [tw, setTw] = useState(160)
  useLayoutEffect(() => {
    if (ref.current) setTw(ref.current.offsetWidth)
  }, [children])
  const left = Math.max(0, Math.min(width - tw, x - tw / 2))
  return (
    <div ref={ref} className="aa-tip" style={{ left, top: y }} role="status">
      {children}
    </div>
  )
}

// ---- Line chart (current vs previous period) ----

export interface LinePoint {
  label: string // x label for the current bucket
  prevLabel?: string
  value: number
  prev?: number
}

interface LineChartProps {
  points: LinePoint[]
  format: Fmt
  height?: number
  /** Show the previous-period comparison line. */
  compare?: boolean
  seriesName?: string
  prevName?: string
}

export function LineChart({
  points,
  format,
  height = 240,
  compare = true,
  seriesName = 'This period',
  prevName = 'Previous period',
}: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { l: 52, r: 12, t: 12, b: 28 }
  const iw = Math.max(0, width - pad.l - pad.r)
  const ih = height - pad.t - pad.b
  const peak = Math.max(0, ...points.map((p) => Math.max(p.value, compare ? (p.prev ?? 0) : 0)))
  const { max, step } = niceMax(peak)
  const n = points.length
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const path = (key: 'value' | 'prev') =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key] ?? 0).toFixed(1)}`).join('')
  const area = n
    ? `${path('value')}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
    : ''
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)
  // Evenly spaced x labels (~6, fewer when narrow — ~56px each); the last
  // label is skipped when it would crowd the previous one.
  const every = Math.max(1, Math.ceil(n / 6), Math.ceil((n * 56) / (iw || 1)))
  const showX = (i: number) => i % every === 0 || (i === n - 1 && (n - 1) % every >= every / 2)

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left - pad.l
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / (iw || 1)) * (n - 1)))))
  }
  const hp = hover != null ? points[hover] : null

  return (
    <div className="aa-chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`${seriesName} trend`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="aa-grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
              <text className="aa-axis" x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            showX(i) ? (
              <text key={i} className="aa-axis" x={x(i)} y={height - 8} textAnchor="middle">
                {p.label}
              </text>
            ) : null,
          )}
          {compare && <path d={path('prev')} className="aa-line aa-line-prev" />}
          <path d={area} className="aa-area" />
          <path d={path('value')} className="aa-line" />
          {n > 0 && !hp && (
            <circle className="aa-dot" cx={x(n - 1)} cy={y(points[n - 1].value)} r={4} />
          )}
          {hp && hover != null && (
            <g>
              <line className="aa-cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} />
              {compare && (
                <circle className="aa-dot aa-dot-prev" cx={x(hover)} cy={y(hp.prev ?? 0)} r={4} />
              )}
              <circle className="aa-dot" cx={x(hover)} cy={y(hp.value)} r={4} />
            </g>
          )}
        </svg>
      )}
      {hp && hover != null && (
        <Tip x={x(hover)} y={0} width={width}>
          <div className="aa-tip-row">
            <span className="aa-key aa-key-cur" />
            <span className="aa-tip-label">{hp.label}</span>
            <strong>{format(hp.value)}</strong>
          </div>
          {compare && (
            <div className="aa-tip-row">
              <span className="aa-key aa-key-prev" />
              <span className="aa-tip-label">{hp.prevLabel}</span>
              <strong>{format(hp.prev ?? 0)}</strong>
            </div>
          )}
        </Tip>
      )}
      {compare && (
        <div className="aa-legend">
          <span>
            <span className="aa-key aa-key-cur" /> {seriesName}
          </span>
          <span>
            <span className="aa-key aa-key-prev" /> {prevName}
          </span>
        </div>
      )}
    </div>
  )
}

// ---- Sparkline (stat tiles) ----

export function Sparkline({ values, height = 28 }: { values: number[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const n = values.length
  const max = Math.max(1e-9, ...values)
  const pts = values.map((v, i) => [
    n <= 1 ? width / 2 : (i / (n - 1)) * (width - 6) + 3,
    height - 3 - (v / max) * (height - 6),
  ])
  return (
    <div className="aa-spark" ref={ref} aria-hidden>
      {width > 0 && n > 1 && (
        <svg width={width} height={height}>
          <polyline className="aa-spark-line" points={pts.map((p) => p.join(',')).join(' ')} />
          <circle className="aa-spark-dot" cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={2.5} />
        </svg>
      )}
    </div>
  )
}

// ---- Columns (distribution / profile) ----

export interface Column {
  label: string
  value: number
  /** Extra tooltip lines. */
  detail?: string
}

interface ColumnsProps {
  data: Column[]
  format: Fmt
  height?: number
  /** Index to emphasise (e.g. the peak); others recede. */
  highlight?: number | null
  /** Show every nth x label (dense hourly charts). */
  labelEvery?: number
  ariaLabel: string
}

export function Columns({ data, format, height = 180, highlight = null, labelEvery = 1, ariaLabel }: ColumnsProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { l: 44, r: 6, t: 18, b: 24 }
  const iw = Math.max(0, width - pad.l - pad.r)
  const ih = height - pad.t - pad.b
  const { max, step } = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const band = data.length ? iw / data.length : 0
  const bw = Math.max(2, Math.min(24, band - 2)) // ≤24px, ≥2px surface gap
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)
  // Thin the x labels when bands get too narrow for them (~34px per label).
  const every = Math.max(labelEvery, Math.ceil(34 / (band || 34)))
  const hd = hover != null ? data[hover] : null

  return (
    <div className="aa-chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="aa-grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
              <text className="aa-axis" x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2
            const h = Math.max(0, y(0) - y(d.value))
            const r = Math.min(4, bw / 2, h)
            const x0 = cx - bw / 2
            const top = y(d.value)
            const dim = highlight != null && highlight !== i && hover !== i
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                {/* Hit target is the whole band, bigger than the mark. */}
                <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
                {h > 0 && (
                  <path
                    className={`aa-bar${dim ? ' aa-bar-dim' : ''}${hover === i ? ' aa-bar-hover' : ''}`}
                    d={`M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${y(0)}Z`}
                  />
                )}
                {i % every === 0 && d.label && (
                  <text className="aa-axis" x={cx} y={height - 8} textAnchor="middle">
                    {d.label}
                  </text>
                )}
              </g>
            )
          })}
          <line className="aa-baseline" x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} />
        </svg>
      )}
      {hd && hover != null && (
        <Tip x={pad.l + band * hover + band / 2} y={0} width={width}>
          <div className="aa-tip-row">
            <span className="aa-tip-label">{hd.label}</span>
            <strong>{format(hd.value)}</strong>
          </div>
          {hd.detail && <div className="aa-tip-sub">{hd.detail}</div>}
        </Tip>
      )}
    </div>
  )
}

// ---- Stacked columns (two series, e.g. new vs returning) ----

interface StackedProps {
  data: { label: string; a: number; b: number }[]
  names: [string, string]
  height?: number
  ariaLabel: string
}

export function StackedColumns({ data, names, height = 200, ariaLabel }: StackedProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pad = { l: 40, r: 6, t: 12, b: 24 }
  const iw = Math.max(0, width - pad.l - pad.r)
  const ih = height - pad.t - pad.b
  const { max, step } = niceMax(Math.max(0, ...data.map((d) => d.a + d.b)))
  const band = data.length ? iw / data.length : 0
  const bw = Math.max(2, Math.min(24, band - 2))
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)
  const every = Math.max(1, Math.ceil(data.length / 7))
  const hd = hover != null ? data[hover] : null

  return (
    <div className="aa-chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="aa-grid" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
              <text className="aa-axis" x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {num(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = pad.l + band * i + (band - bw) / 2
            const ya = y(d.a)
            const yb = y(d.a + d.b)
            const r = Math.min(4, bw / 2)
            const gap = d.a > 0 && d.b > 0 ? 2 : 0 // 2px surface gap between segments
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
                {d.a > 0 && <rect className="aa-seg-a" x={x0} y={ya} width={bw} height={y(0) - ya} />}
                {d.b > 0 && ya - gap - yb > 0 && (
                  <path
                    className="aa-seg-b"
                    d={`M${x0},${ya - gap}V${yb + Math.min(r, ya - gap - yb)}Q${x0},${yb} ${x0 + r},${yb}H${x0 + bw - r}Q${x0 + bw},${yb} ${x0 + bw},${yb + Math.min(r, ya - gap - yb)}V${ya - gap}Z`}
                  />
                )}
                {i % every === 0 && (
                  <text className="aa-axis" x={pad.l + band * i + band / 2} y={height - 8} textAnchor="middle">
                    {d.label}
                  </text>
                )}
              </g>
            )
          })}
          <line className="aa-baseline" x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} />
        </svg>
      )}
      {hd && hover != null && (
        <Tip x={pad.l + band * hover + band / 2} y={0} width={width}>
          <div className="aa-tip-sub">{hd.label}</div>
          <div className="aa-tip-row">
            <span className="aa-key aa-key-b" />
            <span className="aa-tip-label">{names[1]}</span>
            <strong>{num(hd.b)}</strong>
          </div>
          <div className="aa-tip-row">
            <span className="aa-key aa-key-a" />
            <span className="aa-tip-label">{names[0]}</span>
            <strong>{num(hd.a)}</strong>
          </div>
        </Tip>
      )}
      <div className="aa-legend">
        <span>
          <span className="aa-key aa-key-a" /> {names[0]}
        </span>
        <span>
          <span className="aa-key aa-key-b" /> {names[1]}
        </span>
      </div>
    </div>
  )
}

// ---- Horizontal bar list (ranked categories) ----

export interface BarRow {
  key: string | number
  label: ReactNode
  value: number
  display: string
  sub?: string
  onClick?: () => void
}

export function BarList({ rows, empty = 'Nothing to show for this period.' }: { rows: BarRow[]; empty?: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="aa-empty">{empty}</p>
  return (
    <ul className="aa-barlist">
      {rows.map((r) => {
        const body = (
          <>
            <span className="aa-barlist-head">
              <span className="aa-barlist-label">{r.label}</span>
              <span className="aa-barlist-value">
                {r.display}
                {r.sub && <span className="aa-barlist-sub"> · {r.sub}</span>}
              </span>
            </span>
            <span className="aa-barlist-track">
              <span className="aa-barlist-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
          </>
        )
        return (
          <li key={r.key}>
            {r.onClick ? (
              <button type="button" className="aa-barlist-btn" onClick={r.onClick}>
                {body}
              </button>
            ) : (
              <div className="aa-barlist-btn">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ---- Heatmap (weekday × hour) ----

// Single-hue sequential ramp, light → dark; index 0 means "no orders".
const RAMP = ['#f3f6fa', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95']

interface HeatmapProps {
  rows: string[]
  cols: number[] // hours
  value: (row: number, col: number) => number
  format: Fmt
  detail: (row: number, col: number) => string
}

export function Heatmap({ rows, cols, value, format, detail }: HeatmapProps) {
  const [hover, setHover] = useState<[number, number] | null>(null)
  const max = useMemo(() => {
    let m = 0
    rows.forEach((_, r) => cols.forEach((c) => (m = Math.max(m, value(r, c)))))
    return m
  }, [rows, cols, value])
  const step = (v: number) => (v <= 0 || max <= 0 ? 0 : Math.min(RAMP.length - 1, 1 + Math.floor((v / max) * (RAMP.length - 1.001))))
  const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`)

  return (
    <div className="aa-heat-wrap">
      <div className="aa-heat" style={{ gridTemplateColumns: `40px repeat(${cols.length}, minmax(16px, 1fr))` }}>
        <span />
        {cols.map((c) => (
          <span key={c} className="aa-heat-col">
            {c % 2 === 0 ? hourLabel(c) : ''}
          </span>
        ))}
        {rows.map((name, r) => (
          <div key={name} className="aa-heat-row" style={{ display: 'contents' }}>
            <span className="aa-heat-rowlabel">{name}</span>
            {cols.map((c) => {
              const v = value(r, c)
              const on = hover?.[0] === r && hover?.[1] === c
              return (
                <span
                  key={c}
                  className={`aa-heat-cell${on ? ' is-on' : ''}`}
                  style={{ background: RAMP[step(v)] }}
                  onPointerEnter={() => setHover([r, c])}
                  onPointerLeave={() => setHover(null)}
                  aria-label={`${name} ${hourLabel(c)}: ${format(v)}`}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="aa-heat-foot">
        <span className="aa-heat-readout">
          {hover ? (
            <>
              <strong>
                {rows[hover[0]]} · {hourLabel(hover[1])}–{hourLabel((hover[1] + 1) % 24)}
              </strong>{' '}
              {detail(hover[0], hover[1])}
            </>
          ) : (
            'Hover a cell for details'
          )}
        </span>
        <span className="aa-heat-scale" aria-hidden>
          <span>Quiet</span>
          {RAMP.slice(1).map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
          <span>Busy</span>
        </span>
      </div>
    </div>
  )
}

// ---- Menu engineering matrix (the page's signature view) ----

export interface MatrixPoint {
  id: number
  name: string
  x: number // popularity: share of units sold, %
  y: number // average realised price, ₹
  cls: 'star' | 'plowhorse' | 'puzzle' | 'dog'
  revenue: number
}

interface MatrixProps {
  points: MatrixPoint[]
  xThreshold: number
  yThreshold: number
  onPick: (id: number) => void
}

export const QUADRANTS = {
  star: { name: 'Stars', hint: 'Popular and premium — protect and feature them' },
  plowhorse: { name: 'Plowhorses', hint: 'Popular, low price — nudge price or trim cost' },
  puzzle: { name: 'Puzzles', hint: 'Premium, rarely ordered — reposition or promote' },
  dog: { name: 'Dogs', hint: 'Unpopular and cheap — rework or retire' },
} as const

export function Matrix({ points, xThreshold, yThreshold, onPick }: MatrixProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = Math.max(300, Math.min(440, width * 0.62))
  const pad = { l: 52, r: 16, t: 16, b: 40 }
  const iw = Math.max(0, width - pad.l - pad.r)
  const ih = height - pad.t - pad.b
  // Square-root x so a long tail of small sellers isn't crushed into the axis.
  const xMax = Math.max(xThreshold * 2, ...points.map((p) => p.x)) * 1.08
  const yMax = niceMax(Math.max(yThreshold * 2, ...points.map((p) => p.y)) * 1.05).max
  const sx = (v: number) => pad.l + Math.sqrt(Math.max(0, v) / xMax) * iw
  const sy = (v: number) => pad.t + ih - (v / yMax) * ih
  const tx = sx(xThreshold)
  const ty = sy(yThreshold)
  const maxRev = Math.max(1, ...points.map((p) => p.revenue))
  const radius = (rev: number) => 4 + Math.sqrt(rev / maxRev) * 9
  const hp = points.find((p) => p.id === hover) ?? null
  const yTicks = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i)
  const xTicks = [0, xThreshold, xMax / 1.08].filter((v, i, a) => a.indexOf(v) === i)

  const quad = (cls: keyof typeof QUADRANTS, x: number, y: number, anchor: 'start' | 'end') => (
    <text className="aa-quad-name" x={x} y={y} textAnchor={anchor}>
      {QUADRANTS[cls].name}
    </text>
  )

  return (
    <div className="aa-chart aa-matrix" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Menu engineering matrix">
          <rect className="aa-quad aa-quad-star" x={tx} y={pad.t} width={pad.l + iw - tx} height={ty - pad.t} />
          <rect className="aa-quad aa-quad-puzzle" x={pad.l} y={pad.t} width={tx - pad.l} height={ty - pad.t} />
          <rect className="aa-quad aa-quad-plowhorse" x={tx} y={ty} width={pad.l + iw - tx} height={pad.t + ih - ty} />
          <rect className="aa-quad aa-quad-dog" x={pad.l} y={ty} width={tx - pad.l} height={pad.t + ih - ty} />
          {yTicks.map((t) => (
            <text key={t} className="aa-axis" x={pad.l - 8} y={sy(t)} dy="0.32em" textAnchor="end">
              {inr(t)}
            </text>
          ))}
          {xTicks.map((t) => (
            <text key={t} className="aa-axis" x={sx(t)} y={pad.t + ih + 16} textAnchor="middle">
              {pct(Math.round(t * 10) / 10)}
            </text>
          ))}
          <text className="aa-axis-title" x={pad.l + iw / 2} y={height - 4} textAnchor="middle">
            Popularity — share of units sold →
          </text>
          <text
            className="aa-axis-title"
            transform={`translate(12 ${pad.t + ih / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            Avg price realised →
          </text>
          <line className="aa-threshold" x1={tx} x2={tx} y1={pad.t} y2={pad.t + ih} />
          <line className="aa-threshold" x1={pad.l} x2={pad.l + iw} y1={ty} y2={ty} />
          {quad('puzzle', pad.l + 10, pad.t + 20, 'start')}
          {quad('star', pad.l + iw - 10, pad.t + 20, 'end')}
          {quad('dog', pad.l + 10, pad.t + ih - 10, 'start')}
          {quad('plowhorse', pad.l + iw - 10, pad.t + ih - 10, 'end')}
          {/* Biggest earners drawn first so small dots stay on top and hoverable. */}
          {[...points]
            .sort((a, b) => b.revenue - a.revenue)
            .map((p) => (
              <circle
                key={p.id}
                className={`aa-mdot aa-mdot-${p.cls}${hover === p.id ? ' is-on' : ''}`}
                cx={sx(p.x)}
                cy={sy(p.y)}
                r={radius(p.revenue)}
                tabIndex={0}
                role="button"
                aria-label={`${p.name}: ${QUADRANTS[p.cls].name}`}
                onPointerEnter={() => setHover(p.id)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(p.id)}
                onBlur={() => setHover(null)}
                onClick={() => onPick(p.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(p.id)}
              />
            ))}
          {/* Direct-label the top earners only — never every dot. */}
          {[...points]
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, width < 500 ? 3 : 5)
            .map((p) => {
              // Flip to the dot's left when the label would run off the plot.
              const left = sx(p.x) > pad.l + iw * 0.8
              const off = radius(p.revenue) + 4
              return (
                <text
                  key={p.id}
                  className="aa-mlabel"
                  x={sx(p.x) + (left ? -off : off)}
                  y={sy(p.y)}
                  dy="0.32em"
                  textAnchor={left ? 'end' : 'start'}
                >
                  {p.name}
                </text>
              )
            })}
        </svg>
      )}
      {hp && (
        <Tip x={sx(hp.x)} y={Math.max(0, sy(hp.y) - 86)} width={width}>
          <div className="aa-tip-title">
            <span className={`aa-key aa-key-${hp.cls}`} /> {hp.name}
          </div>
          <div className="aa-tip-row">
            <span className="aa-tip-label">Share of units</span>
            <strong>{pct(hp.x)}</strong>
          </div>
          <div className="aa-tip-row">
            <span className="aa-tip-label">Avg price</span>
            <strong>{inrExact(hp.y)}</strong>
          </div>
          <div className="aa-tip-row">
            <span className="aa-tip-label">Revenue</span>
            <strong>{inr(hp.revenue)}</strong>
          </div>
          <div className="aa-tip-sub">{QUADRANTS[hp.cls].name} · click for details</div>
        </Tip>
      )}
    </div>
  )
}
