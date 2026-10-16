import { useEffect, useMemo, useState } from 'react'
import {
  getServiceReviewScores,
  type ServiceReviewScores,
} from '../../api'
import ManagerHeader from '../../components/ManagerHeader'

interface Props {
  onBack: () => void
}

// The 20 service aspects. `key` matches the ServiceReviewScores field returned
// by the API; `label` is the human name; `desc` is the hardcoded "read more"
// explaining what the aspect measures.
const ASPECTS: {
  key: keyof ServiceReviewScores
  label: string
  desc: string
}[] = [
  {
    key: 'staff_friendliness',
    label: 'Staff Friendliness',
    desc: 'How warm, welcoming and courteous the team is with guests — smiles, greetings and a genuine willingness to help.',
  },
  {
    key: 'speed_of_service',
    label: 'Speed of Service',
    desc: 'How quickly orders are taken, prepared and delivered, from walking in to being served.',
  },
  {
    key: 'order_accuracy',
    label: 'Order Accuracy',
    desc: 'Whether guests receive exactly what they ordered — the right items, made the right way, with no missing extras.',
  },
  {
    key: 'attentiveness',
    label: 'Attentiveness',
    desc: 'How well staff notice and respond to needs — refills, checking in, clearing plates — without having to be flagged down.',
  },
  {
    key: 'atmosphere_ambiance',
    label: 'Atmosphere / Ambiance',
    desc: 'The overall mood of the space: lighting, music, warmth and the feeling guests get while they sit.',
  },
  {
    key: 'cleanliness',
    label: 'Cleanliness',
    desc: 'How clean tables, floors, restrooms and serving areas are kept throughout the day.',
  },
  {
    key: 'value_for_money',
    label: 'Value for Money',
    desc: 'Whether guests feel the quality, portions and experience justify the price they paid.',
  },
  {
    key: 'food_quality',
    label: 'Food Quality',
    desc: 'Taste, freshness, temperature and presentation of the food that comes out of the kitchen.',
  },
  {
    key: 'beverage_quality',
    label: 'Beverage Quality',
    desc: 'Taste and consistency of coffee, tea and other drinks — the core of a cafe’s reputation.',
  },
  {
    key: 'menu_variety',
    label: 'Menu Variety',
    desc: 'How wide and appealing the range of food and drink options is, including dietary choices.',
  },
  {
    key: 'seating_comfort',
    label: 'Seating Comfort',
    desc: 'Comfort of the chairs and tables and how much room guests have between each other.',
  },
  {
    key: 'wait_time_queue_management',
    label: 'Wait Time / Queue Management',
    desc: 'How well lines and wait times are handled, especially at busy peaks.',
  },
  {
    key: 'problem_resolution',
    label: 'Problem Resolution',
    desc: 'How gracefully staff handle complaints, mistakes and special requests when things go wrong.',
  },
  {
    key: 'staff_knowledge',
    label: 'Staff Knowledge',
    desc: 'How well staff know the menu and can confidently answer questions and make recommendations.',
  },
  {
    key: 'noise_level',
    label: 'Noise Level',
    desc: 'Whether the space is comfortably quiet enough to talk, or too loud for a relaxed visit.',
  },
  {
    key: 'payment_billing_experience',
    label: 'Payment & Billing Experience',
    desc: 'How smooth, fast and error-free paying the bill is, including splitting and card options.',
  },
  {
    key: 'kid_family_friendliness',
    label: 'Kid-Family Friendliness',
    desc: 'How welcoming the cafe is for children and families — space, patience and suitable options.',
  },
  {
    key: 'pet_friendliness',
    label: 'Pet Friendliness',
    desc: 'How welcoming the cafe is for guests arriving with pets.',
  },
  {
    key: 'aesthetic_decor',
    label: 'Aesthetic / Decor',
    desc: 'The look and style of the interior — furnishings, colours and the little design touches.',
  },
  {
    key: 'accessibility',
    label: 'Accessibility',
    desc: 'How easy the cafe is to enter and use for guests with disabilities or mobility needs.',
  },
]

// Score bands, best first. Each aspect falls into exactly one band (or "No data"
// when the AI couldn't score it). Colours flow red -> amber -> green so the page
// reads at a glance.
interface Band {
  id: string
  label: string
  hint: string
  color: string
  inRange: (v: number) => boolean
}
const BANDS: Band[] = [
  {
    id: 'excellent',
    label: 'Excellent',
    hint: 'Guests consistently love this',
    color: '#10b981',
    inRange: (v) => v >= 9,
  },
  {
    id: 'good',
    label: 'Good',
    hint: 'Solid, with a little headroom',
    color: '#38bd9c',
    inRange: (v) => v >= 7 && v < 9,
  },
  {
    id: 'watch',
    label: 'Needs work',
    hint: 'Mixed feedback — worth a look',
    color: '#f0a020',
    inRange: (v) => v >= 4 && v < 7,
  },
  {
    id: 'critical',
    label: 'Critical',
    hint: 'Hurting the guest experience',
    color: '#e24a6e',
    inRange: (v) => v < 4,
  },
]
const NO_DATA = {
  id: 'nodata',
  label: 'Not enough data',
  hint: 'Reviews haven’t mentioned this yet',
  color: '#a99fb5',
}

function bandFor(value: number | null): Band | typeof NO_DATA {
  if (value == null) return NO_DATA
  return BANDS.find((b) => b.inRange(value)) ?? NO_DATA
}

type ViewMode = 'bars' | 'radar' | 'grid'
type SortDir = 'high' | 'low'

interface Scored {
  key: keyof ServiceReviewScores
  label: string
  desc: string
  value: number | null
}

export default function ServiceReviewAnalysis({ onBack }: Props) {
  const [scores, setScores] = useState<ServiceReviewScores | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [view, setView] = useState<ViewMode>('bars')
  const [sort, setSort] = useState<SortDir>('high')
  const [showInfo, setShowInfo] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getServiceReviewScores()
      .then((s) => alive && setScores(s))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const scored: Scored[] = useMemo(
    () =>
      ASPECTS.map((a) => ({
        ...a,
        value: scores ? (scores[a.key] as number | null) : null,
      })),
    [scores],
  )

  const rated = scored.filter((a) => a.value != null) as (Scored & {
    value: number
  })[]
  const hasAnyScore = rated.length > 0

  // Overall average across the aspects the AI could actually score.
  const average = hasAnyScore
    ? rated.reduce((s, a) => s + a.value, 0) / rated.length
    : 0
  const verdict =
    average >= 8.5
      ? 'Excellent service'
      : average >= 7
        ? 'Strong service'
        : average >= 5
          ? 'Room to improve'
          : 'Needs attention'

  // Rated aspects sorted by the chosen direction; unrated always trail.
  const sortedRated = useMemo(() => {
    const dir = sort === 'high' ? -1 : 1
    return [...rated].sort((a, b) => (a.value - b.value) * dir)
  }, [rated, sort])
  const unrated = scored.filter((a) => a.value == null)
  const flatSorted = [...sortedRated, ...unrated]

  // Per-band counts for the distribution strip.
  const dist = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of scored) counts[bandFor(a.value).id] = (counts[bandFor(a.value).id] ?? 0) + 1
    return counts
  }, [scored])

  // Breakdown: bands in best->worst (or worst->best) order, "No data" always last.
  const groups = useMemo(() => {
    const ordered = sort === 'high' ? BANDS : [...BANDS].reverse()
    const result: { band: Band | typeof NO_DATA; items: Scored[] }[] = []
    for (const band of ordered) {
      const items = sortedRated.filter((a) => bandFor(a.value).id === band.id)
      if (items.length) result.push({ band, items })
    }
    if (unrated.length) result.push({ band: NO_DATA, items: unrated })
    return result
  }, [sortedRated, unrated, sort])

  return (
    <div className="screen menu-screen mgr-screen">
      <ManagerHeader onBack={onBack} />

      <div className="menu-head">
        <div className="sra-titlerow">
          <h1 className="menu-title">Service review analysis</h1>
          <button
            type="button"
            className={`sra-info-btn${showInfo ? ' is-on' : ''}`}
            onClick={() => setShowInfo((v) => !v)}
            aria-label="How these scores are calculated"
            aria-expanded={showInfo}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="7.5" r="1.3" fill="currentColor" />
              <path
                d="M12 11v6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <p className="muted">
          AI scores across {scores?.number_of_reviews ?? 0} review(s), 0–10 per
          aspect.
        </p>
      </div>

      {showInfo && (
        <div className="sra-info">
          <p className="sra-info-lead">How the AI builds these scores</p>
          <ol className="sra-info-steps">
            <li>
              Every service review — its star rating and written note — is
              gathered into one body of feedback.
            </li>
            <li>
              It’s handed to Gemini, which reads all the reviews together rather
              than one at a time.
            </li>
            <li>
              The AI rates each of the 20 aspects from 0–10 using{' '}
              <strong>only evidence it finds in the reviews</strong>.
            </li>
            <li>
              If the reviews never touch an aspect, it returns{' '}
              <strong>“no data”</strong> instead of guessing a number.
            </li>
            <li>
              Scores are clamped to 0–10, saved, and recomputed automatically
              every 20 new reviews.
            </li>
          </ol>
        </div>
      )}

      {error && <p className="form-error center">{error}</p>}
      {loading && <p className="muted center">Loading…</p>}

      {!loading && !error && !hasAnyScore && (
        <p className="muted center">
          No scores yet — they’re computed automatically once reviews come in.
        </p>
      )}

      {!loading && !error && hasAnyScore && (
        <>
          {/* ---- Summary hero ---- */}
          <section className="sra-hero">
            <div
              className="sra-ring"
              style={{
                background: `conic-gradient(${bandFor(Math.round(average)).color} ${
                  average * 36
                }deg, #ece7f1 0)`,
              }}
            >
              <div className="sra-ring-core">
                <span className="sra-ring-num">{average.toFixed(1)}</span>
                <span className="sra-ring-max">/10</span>
              </div>
            </div>
            <div className="sra-hero-body">
              <span className="sra-hero-verdict">{verdict}</span>
              <span className="sra-hero-sub">
                Average across {rated.length} scored aspect
                {rated.length === 1 ? '' : 's'}
              </span>
              <div className="sra-dist">
                {BANDS.map((b) =>
                  dist[b.id] ? (
                    <span key={b.id} className="sra-dist-pill">
                      <i style={{ background: b.color }} />
                      {dist[b.id]} {b.label}
                    </span>
                  ) : null,
                )}
                {dist[NO_DATA.id] ? (
                  <span className="sra-dist-pill">
                    <i style={{ background: NO_DATA.color }} />
                    {dist[NO_DATA.id]} No data
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          {/* ---- Graph card with view + sort controls ---- */}
          <section className="sra-card">
            <div className="sra-toolbar">
              <div className="sra-seg" role="tablist" aria-label="Chart view">
                {(
                  [
                    ['bars', 'Bars'],
                    ['radar', 'Radar'],
                    ['grid', 'Grid'],
                  ] as [ViewMode, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={view === id}
                    className={`sra-seg-btn${view === id ? ' is-on' : ''}`}
                    onClick={() => setView(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {view !== 'radar' && (
                <button
                  type="button"
                  className="sra-sort"
                  onClick={() => setSort((s) => (s === 'high' ? 'low' : 'high'))}
                >
                  {sort === 'high' ? 'High → Low' : 'Low → High'}
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                    <path
                      d={
                        sort === 'high'
                          ? 'M12 5v14M6 13l6 6 6-6'
                          : 'M12 19V5M6 11l6-6 6 6'
                      }
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>

            {view === 'bars' && <BarsChart items={flatSorted} />}
            {view === 'grid' && <GridChart items={flatSorted} />}
            {view === 'radar' && <RadarChart items={scored} />}
          </section>

          {/* ---- Categorised breakdown with read-more ---- */}
          <section className="sra-breakdown">
            {groups.map(({ band, items }) => (
              <div key={band.id} className="sra-band">
                <div className="sra-band-head">
                  <span className="sra-band-dot" style={{ background: band.color }} />
                  <span className="sra-band-name">{band.label}</span>
                  <span className="sra-band-count">{items.length}</span>
                  <span className="sra-band-hint">{band.hint}</span>
                </div>
                {items.map((a) => {
                  const isOpen = open === a.key
                  return (
                    <div key={a.key} className="sra-aspect">
                      <button
                        type="button"
                        className="sra-aspect-top"
                        onClick={() => setOpen(isOpen ? null : (a.key as string))}
                        aria-expanded={isOpen}
                      >
                        <span className="sra-aspect-name">{a.label}</span>
                        <span
                          className="sra-aspect-score"
                          style={{
                            color: band.color,
                            borderColor: `${band.color}55`,
                            background: `${band.color}14`,
                          }}
                        >
                          {a.value != null ? a.value : '—'}
                        </span>
                        <svg
                          className={`sra-chev${isOpen ? ' is-open' : ''}`}
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="none"
                        >
                          <path
                            d="M6 9l6 6 6-6"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      {isOpen && <p className="sra-aspect-desc">{a.desc}</p>}
                    </div>
                  )
                })}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}

/** Sorted horizontal bars. Unrated aspects show an empty track and a dash. */
function BarsChart({ items }: { items: Scored[] }) {
  return (
    <ul className="sra-bars">
      {items.map((a) => {
        const band = bandFor(a.value)
        return (
          <li key={a.key} className="sra-bar-row">
            <span className="sra-bar-label">{a.label}</span>
            <div className="sra-bar-track">
              {a.value != null && (
                <div
                  className="sra-bar-fill"
                  style={{ width: `${a.value * 10}%`, background: band.color }}
                />
              )}
            </div>
            <span className="sra-bar-score">
              {a.value != null ? a.value : '—'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Compact colour-coded tiles — a heatmap of the whole service at a glance. */
function GridChart({ items }: { items: Scored[] }) {
  return (
    <div className="sra-grid">
      {items.map((a) => {
        const band = bandFor(a.value)
        return (
          <div
            key={a.key}
            className="sra-tile"
            style={{
              background: a.value != null ? `${band.color}16` : '#f4f1f7',
              borderColor: a.value != null ? `${band.color}44` : '#e7e2ee',
            }}
          >
            <span className="sra-tile-score" style={{ color: band.color }}>
              {a.value != null ? a.value : '—'}
            </span>
            <span className="sra-tile-label">{a.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Radar / spider chart showing the overall "shape" of service. Rated aspects
 *  are plotted around the circle; vertex dots are coloured by band so weak
 *  directions (red) stand out from strong ones (green). */
function RadarChart({ items }: { items: Scored[] }) {
  const N = items.length
  const cx = 130
  const cy = 130
  const R = 100

  const point = (i: number, r: number): [number, number] => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N
    return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]
  }

  const rings = [2, 4, 6, 8, 10].map((level) =>
    items.map((_, i) => point(i, (R * level) / 10).join(',')).join(' '),
  )

  const rated = items.filter((a) => a.value != null)
  const poly = items
    .map((a, i) => (a.value != null ? point(i, (R * a.value) / 10) : null))
    .filter((p): p is [number, number] => p !== null)
    .map((p) => p.join(','))
    .join(' ')

  return (
    <div className="sra-radar">
      <svg viewBox="0 0 260 260" width="100%" role="img" aria-label="Radar chart of service scores">
        <defs>
          <radialGradient id="sra-radar-fill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#b06bf5" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#b06bf5" stopOpacity="0.14" />
          </radialGradient>
        </defs>
        {/* grid rings */}
        {rings.map((pts, i) => (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="#e6e0ee"
            strokeWidth={i === rings.length - 1 ? 1.4 : 1}
          />
        ))}
        {/* spokes */}
        {items.map((_, i) => {
          const [x, y] = point(i, R)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#efeaf4" strokeWidth={1} />
        })}
        {/* data polygon */}
        {rated.length >= 3 && (
          <polygon points={poly} fill="url(#sra-radar-fill)" stroke="#b06bf5" strokeWidth={2} strokeLinejoin="round" />
        )}
        {/* vertex dots coloured by band */}
        {items.map((a, i) => {
          if (a.value == null) return null
          const [x, y] = point(i, (R * a.value) / 10)
          return <circle key={i} cx={x} cy={y} r={3.4} fill={bandFor(a.value).color} stroke="#fff" strokeWidth={1.4} />
        })}
      </svg>
      <p className="sra-radar-cap">
        The fuller and rounder the shape, the stronger and more balanced the
        service. Dots turn red where guests flag problems.
      </p>
    </div>
  )
}
