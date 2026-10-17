import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import './AdminAnalytics.css'
import {
  clearAnalyticsCache,
  getBaskets,
  getCustomers,
  getItemDetail,
  getItemsAnalytics,
  getOperations,
  getOverview,
  getTimePatterns,
  type CustomerRow,
  type EngineeringClass,
  type ItemRow,
  type Kpi,
  type Period,
  type Range,
  type TrendPoint,
} from '../../analyticsApi'
import {
  BarList,
  Columns,
  Heatmap,
  LineChart,
  Matrix,
  QUADRANTS,
  Sparkline,
  StackedColumns,
  inr,
  inrExact,
  num,
  pct,
  type Fmt,
  type MatrixPoint,
} from '../../components/analytics/Charts'

interface Props {
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

type Preset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'mtd' | 'last-month' | 'custom'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'mtd', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
]

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function presetRange(p: Exclude<Preset, 'custom'>): Range {
  const t = new Date()
  const day = (offset: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + offset)
  switch (p) {
    case 'today':
      return { start: ymd(t), end: ymd(t) }
    case 'yesterday':
      return { start: ymd(day(-1)), end: ymd(day(-1)) }
    case '7d':
      return { start: ymd(day(-6)), end: ymd(t) }
    case '30d':
      return { start: ymd(day(-29)), end: ymd(t) }
    case '90d':
      return { start: ymd(day(-89)), end: ymd(t) }
    case 'mtd':
      return { start: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), end: ymd(t) }
    case 'last-month':
      return {
        start: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        end: ymd(new Date(t.getFullYear(), t.getMonth(), 0)),
      }
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Parse a naive ISO stamp from the API as local wall-clock time. */
const parseLocal = (iso: string) => {
  const [d, t = '00:00'] = iso.split('T')
  const [y, m, dd] = d.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  return new Date(y, m - 1, dd, hh, mm)
}
const shortDate = (iso: string) => {
  const d = parseLocal(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}
const hourName = (h: number) => (h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`)

/** Axis/tooltip label for a trend bucket at the period's granularity. */
function bucketLabel(iso: string, g: Period['granularity']): string {
  const d = parseLocal(iso)
  if (g === 'hour') return hourName(d.getHours())
  if (g === 'month') return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
  if (g === 'week') return `w/c ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function periodText(p: Period) {
  const fmt = (s: string) => {
    const d = parseLocal(s)
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  }
  const span = (a: string, b: string) => (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`)
  return { current: span(p.start, p.end), previous: span(p.prev_start, p.prev_end) }
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  })
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    load()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

function Loader<T>({
  state,
  children,
}: {
  state: { data: T | null; error: string | null; loading: boolean }
  children: (data: T) => ReactNode
}) {
  if (state.error) return <div className="aa-state aa-state-error">Couldn’t load analytics: {state.error}</div>
  if (!state.data) return <div className="aa-state">Crunching the numbers…</div>
  return <div className={`aa-stack${state.loading ? ' aa-stale' : ''}`}>{children(state.data)}</div>
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function Card({
  title,
  sub,
  actions,
  children,
  className = '',
}: {
  title: string
  sub?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`aa-card ${className}`}>
      <header className="aa-card-head">
        <div>
          <h2 className="aa-card-title">{title}</h2>
          {sub && <p className="aa-card-sub">{sub}</p>}
        </div>
        {actions && <div className="aa-card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

/** Signed change vs the previous period; colour = direction × whether up is good. */
function Delta({ kpi, invert = false, unit = '%' }: { kpi: Kpi; invert?: boolean; unit?: '%' | 'pt' }) {
  const change = unit === 'pt' ? kpi.value - kpi.previous : kpi.change_pct
  if (change == null) {
    return <span className="aa-delta">{kpi.value ? 'New this period' : 'No change'}</span>
  }
  const rounded = Math.round(change * 10) / 10
  if (rounded === 0) return <span className="aa-delta">No change</span>
  const up = rounded > 0
  const good = invert ? !up : up
  return (
    <span className={`aa-delta ${good ? 'is-good' : 'is-bad'}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span> {Math.abs(rounded)}
      {unit === 'pt' ? ' pts' : '%'}
      <span className="aa-sr"> {good ? '(better)' : '(worse)'}</span>
    </span>
  )
}

function StatTile({
  label,
  kpi,
  format,
  invert,
  unit,
  spark,
  note,
}: {
  label: string
  kpi: Kpi
  format: Fmt
  invert?: boolean
  unit?: '%' | 'pt'
  spark?: number[]
  note?: string
}) {
  return (
    <div className="aa-stat">
      <span className="aa-stat-label">{label}</span>
      <span className="aa-stat-value">{format(kpi.value)}</span>
      <span className="aa-stat-foot">
        <Delta kpi={kpi} invert={invert} unit={unit} />
        <span className="aa-stat-prev">vs {format(kpi.previous)}</span>
      </span>
      {note && <span className="aa-stat-note">{note}</span>}
      {spark && <Sparkline values={spark} />}
    </div>
  )
}

function Plain({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="aa-stat">
      <span className="aa-stat-label">{label}</span>
      <span className="aa-stat-value">{value}</span>
      {note && <span className="aa-stat-note">{note}</span>}
    </div>
  )
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { key: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="aa-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          className={value === o.key ? 'is-on' : ''}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  cart: 'Open carts',
  received: 'Received',
  preparing: 'Preparing',
  ready: 'Ready',
  payment_pending: 'Awaiting payment',
  payment_completed: 'Paid',
  cancelled: 'Cancelled',
}

const CLASS_LABEL: Record<EngineeringClass, string> = {
  star: 'Star',
  plowhorse: 'Plowhorse',
  puzzle: 'Puzzle',
  dog: 'Dog',
  no_sales: 'No sales',
}

const minutes = (m: number | null) =>
  m == null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.floor(m / 1440)} d`

const trendPoints = (t: TrendPoint[], g: Period['granularity'], key: 'sales' | 'orders' | 'aov') =>
  t.map((p) => ({
    label: bucketLabel(p.bucket, g),
    prevLabel: bucketLabel(p.prev_bucket, g),
    value: p[key],
    prev: p[key === 'sales' ? 'prev_sales' : key === 'orders' ? 'prev_orders' : 'prev_aov'],
  }))

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({ range, onTab }: { range: Range; onTab: (t: Tab) => void }) {
  const state = useLoad(() => getOverview(range), [range.start, range.end])
  const [metric, setMetric] = useState<'sales' | 'orders' | 'aov'>('sales')

  return (
    <Loader state={state}>
      {(o) => {
        const k = o.kpis
        const g = o.period.granularity
        const sparks = {
          sales: o.trend.map((p) => p.sales),
          orders: o.trend.map((p) => p.orders),
          aov: o.trend.map((p) => p.aov),
        }
        const open = o.pipeline.reduce((s, p) => s + p.orders, 0)
        const stale = o.pipeline.filter((p) => (p.oldest_minutes ?? 0) > 30)
        const insights = buildInsights(o.kpis, o.trend, g)
        const fmt: Fmt = metric === 'orders' ? num : inr

        return (
          <div className="aa-stack">
            <section className="aa-live" aria-label="Orders right now">
              <span className="aa-live-title">
                <span className="aa-live-dot" aria-hidden /> Right now
              </span>
              {o.pipeline.map((p) => (
                <span key={p.status} className="aa-live-stage">
                  <strong>{p.orders}</strong> {STATUS_LABEL[p.status]}
                  {p.orders > 0 && <span className="aa-live-sub"> · {inr(p.value)}</span>}
                </span>
              ))}
              {open > 0 && stale.length > 0 && (
                <span className="aa-live-warn">
                  ⚠ Oldest {STATUS_LABEL[stale[0].status].toLowerCase()} order waiting {minutes(stale[0].oldest_minutes)}
                </span>
              )}
            </section>

            <div className="aa-hero-row">
              <section className="aa-card aa-hero">
                <span className="aa-stat-label">Net sales</span>
                <span className="aa-hero-value">{inrExact(k.net_sales.value)}</span>
                <span className="aa-stat-foot">
                  <Delta kpi={k.net_sales} />
                  <span className="aa-stat-prev">vs {inrExact(k.net_sales.previous)} the period before</span>
                </span>
                <div className="aa-hero-split">
                  <span>
                    <span className="aa-stat-label">Collected</span>
                    <strong>{inr(k.collected.value)}</strong>
                  </span>
                  <span>
                    <span className="aa-stat-label">Still unpaid</span>
                    <strong>{inr(k.outstanding.value)}</strong>
                  </span>
                  <span>
                    <span className="aa-stat-label">Per day</span>
                    <strong>{inr(k.sales_per_day.value)}</strong>
                  </span>
                </div>
              </section>
              <section className="aa-card aa-insights">
                <h2 className="aa-card-title">What stands out</h2>
                {insights.length ? (
                  <ul>
                    {insights.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="aa-empty">No orders in this period yet — pick a longer range to see trends.</p>
                )}
              </section>
            </div>

            <div className="aa-stats">
              <StatTile label="Orders" kpi={k.orders} format={num} spark={sparks.orders} />
              <StatTile label="Average order value" kpi={k.aov} format={inrExact} spark={sparks.aov} />
              <StatTile label="Items per order" kpi={k.items_per_order} format={(v) => v.toFixed(2)} />
              <StatTile
                label="Customers"
                kpi={k.customers}
                format={num}
                note={`${num(k.new_customers.value)} new · ${num(k.returning_customers.value)} returning`}
              />
              <StatTile label="Repeat rate" kpi={k.repeat_rate} format={pct} unit="pt" note="Came back 2+ times in the period" />
              <StatTile label="Cancellation rate" kpi={k.cancellation_rate} format={pct} unit="pt" invert note={`${num(k.cancelled_orders.value)} orders · ${inr(k.cancelled_value.value)} lost`} />
              <StatTile
                label="Avg item rating"
                kpi={k.avg_rating}
                format={(v) => (v ? `${v.toFixed(2)} ★` : '—')}
                note={`${num(k.ratings.value)} ratings`}
              />
              <StatTile label="Units sold" kpi={k.items_sold} format={num} />
            </div>

            <Card
              title="Sales trend"
              sub={`By ${g} · this period against the one before`}
              actions={
                <Seg
                  label="Trend metric"
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { key: 'sales', label: 'Sales' },
                    { key: 'orders', label: 'Orders' },
                    { key: 'aov', label: 'Avg order' },
                  ]}
                />
              }
            >
              <LineChart points={trendPoints(o.trend, g, metric)} format={fmt} />
            </Card>

            <nav className="aa-jump" aria-label="Explore further">
              <button type="button" onClick={() => onTab('menu')}>
                <strong>Menu performance</strong>
                <span>Which dishes earn their place</span>
              </button>
              <button type="button" onClick={() => onTab('traffic')}>
                <strong>Busy hours</strong>
                <span>Plan staff around the rush</span>
              </button>
              <button type="button" onClick={() => onTab('baskets')}>
                <strong>Baskets</strong>
                <span>What sells together</span>
              </button>
              <button type="button" onClick={() => onTab('customers')}>
                <strong>Customers</strong>
                <span>Who comes back — and who stopped</span>
              </button>
            </nav>
          </div>
        )
      }}
    </Loader>
  )
}

/** Plain-language observations a consultant would lead with. */
function buildInsights(k: Record<string, Kpi>, trend: TrendPoint[], g: Period['granularity']): string[] {
  const out: string[] = []
  const s = k.net_sales
  if (!s.value && !s.previous) return out
  if (s.change_pct != null) {
    const dir = s.change_pct >= 0 ? 'up' : 'down'
    const o = k.orders.change_pct ?? 0
    const a = k.aov.change_pct ?? 0
    const driver =
      Math.abs(o) >= Math.abs(a)
        ? `mostly from ${o >= 0 ? 'more' : 'fewer'} orders (${o >= 0 ? '+' : ''}${o}%)`
        : `mostly from ${a >= 0 ? 'bigger' : 'smaller'} baskets (avg order ${a >= 0 ? '+' : ''}${a}%)`
    out.push(`Sales are ${dir} ${Math.abs(s.change_pct)}% on the previous period, ${driver}.`)
  }
  if (g !== 'hour' && trend.length > 1) {
    const best = trend.reduce((m, p) => (p.sales > m.sales ? p : m), trend[0])
    if (best.sales > 0) out.push(`Best ${g}: ${bucketLabel(best.bucket, g)} with ${inr(best.sales)} from ${best.orders} orders.`)
  }
  if (k.customers.value) {
    out.push(
      `${pct(k.repeat_rate.value)} of customers ordered more than once; ${num(k.new_customers.value)} first-time customers joined.`,
    )
  }
  if (k.cancellation_rate.value >= 5) {
    out.push(`Cancellations are high at ${pct(k.cancellation_rate.value)} — ${inr(k.cancelled_value.value)} of orders lost.`)
  }
  if (k.outstanding.value > 0) {
    out.push(`${inr(k.outstanding.value)} of this period’s orders hasn’t been marked paid yet.`)
  }
  return out.slice(0, 4)
}

// ---------------------------------------------------------------------------
// Menu performance
// ---------------------------------------------------------------------------

type SortKey = 'name' | 'qty' | 'revenue' | 'revenue_change_pct' | 'penetration' | 'avg_rating' | 'avg_price'

function MenuTab({ range, onItem }: { range: Range; onItem: (id: number) => void }) {
  const [category, setCategory] = useState<number | undefined>(undefined)
  const state = useLoad(() => getItemsAnalytics(range, category), [range.start, range.end, category])
  // Category list comes from the unscoped load so the pills stay put when one is picked.
  const all = useLoad(() => getItemsAnalytics(range), [range.start, range.end])
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'revenue', desc: true })
  const [filter, setFilter] = useState<EngineeringClass | 'all'>('all')
  const [query, setQuery] = useState('')

  return (
    <div className="aa-stack">
      {all.data && all.data.categories.length > 1 && (
        <div className="aa-pills" role="radiogroup" aria-label="Category">
          <button type="button" role="radio" aria-checked={category == null} className={category == null ? 'is-on' : ''} onClick={() => setCategory(undefined)}>
            Whole menu
          </button>
          {all.data.categories.map((c) => (
            <button
              key={c.category_id ?? 'none'}
              type="button"
              role="radio"
              aria-checked={category === c.category_id}
              className={category === c.category_id ? 'is-on' : ''}
              onClick={() => setCategory(c.category_id ?? undefined)}
            >
              {c.category}
            </button>
          ))}
        </div>
      )}
      <Loader state={state}>
        {(d) => {
          const sold = d.items.filter((i) => i.qty > 0)
          const nonSellers = d.items.filter((i) => i.qty === 0 && i.is_active)
          const aItems = d.items.filter((i) => i.abc === 'A').length
          const points: MatrixPoint[] = sold
            .filter((i): i is ItemRow & { engineering: MatrixPoint['cls'] } => i.engineering !== 'no_sales')
            .map((i) => ({ id: i.item_id, name: i.name, x: i.qty_share, y: i.avg_price, cls: i.engineering, revenue: i.revenue }))
          const q = query.trim().toLowerCase()
          const rows = d.items
            .filter((i) => (filter === 'all' || i.engineering === filter) && (!q || i.name.toLowerCase().includes(q)))
            .sort((a, b) => {
              const av = a[sort.key] ?? -Infinity
              const bv = b[sort.key] ?? -Infinity
              const c = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
              return sort.desc ? -c : c
            })
          const th = (key: SortKey, label: string, cls = 'num') => (
            <th className={cls} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
              <button type="button" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}>
                {label}
                {sort.key === key && <span aria-hidden>{sort.desc ? ' ↓' : ' ↑'}</span>}
              </button>
            </th>
          )

          return (
            <>
              <div className="aa-stats">
                <Plain label="Menu items analysed" value={num(d.menu_size)} note={`${num(d.items_sold)} sold at least once`} />
                <Plain label="Units sold" value={num(d.total_qty)} note={`${inr(d.total_revenue)} revenue`} />
                <Plain
                  label="Revenue concentration"
                  value={`${aItems} item${aItems === 1 ? '' : 's'}`}
                  note="bring in 80% of revenue"
                />
                <Plain label="Didn’t sell" value={num(nonSellers.length)} note="active items with zero orders" />
              </div>

              <Card
                title="Menu engineering"
                sub={
                  <>
                    Each dish placed by how often it sells and what it earns per unit. Lines mark the menu average price (
                    {inrExact(d.avg_item_price)}) and the 70% popularity rule ({pct(d.popularity_threshold)} of units). Dot size =
                    revenue.
                  </>
                }
                className="aa-card-signature"
              >
                {points.length ? (
                  <>
                    <Matrix points={points} xThreshold={d.popularity_threshold} yThreshold={d.avg_item_price} onPick={onItem} />
                    <div className="aa-quads">
                      {(Object.keys(QUADRANTS) as (keyof typeof QUADRANTS)[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`aa-quad-card${filter === c ? ' is-on' : ''}`}
                          onClick={() => setFilter((f) => (f === c ? 'all' : c))}
                          aria-pressed={filter === c}
                        >
                          <span className="aa-quad-card-head">
                            <span className={`aa-key aa-key-${c}`} />
                            <strong>{QUADRANTS[c].name}</strong>
                            <span className="aa-quad-count">{d.engineering_counts[c] ?? 0}</span>
                          </span>
                          <span className="aa-quad-hint">{QUADRANTS[c].hint}</span>
                        </button>
                      ))}
                    </div>
                    <p className="aa-footnote">
                      Price stands in for profit because the menu doesn’t record food cost. Click a dot, a group or a row to
                      dig in.
                    </p>
                  </>
                ) : (
                  <p className="aa-empty">No dishes sold in this period.</p>
                )}
              </Card>

              <div className="aa-grid-2">
                <Card title="Category mix" sub="Share of revenue and change vs the previous period">
                  <BarList
                    rows={d.categories.map((c) => ({
                      key: c.category_id ?? c.category,
                      label: c.category,
                      value: c.revenue,
                      display: `${inr(c.revenue)} · ${pct(c.revenue_share)}`,
                      sub: c.revenue_change_pct == null ? 'new' : `${c.revenue_change_pct >= 0 ? '+' : ''}${c.revenue_change_pct}%`,
                    }))}
                  />
                </Card>
                <Card title="Not selling" sub="Active dishes nobody ordered this period — candidates to cut or promote">
                  {nonSellers.length ? (
                    <ul className="aa-chips">
                      {nonSellers.map((i) => (
                        <li key={i.item_id}>
                          <button type="button" onClick={() => onItem(i.item_id)}>
                            {i.name}
                            <span>{inrExact(i.menu_price)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="aa-empty">Every active dish sold at least once. 👏</p>
                  )}
                </Card>
              </div>

              <Card
                title="Every dish"
                sub={`${rows.length} of ${d.items.length} shown${filter !== 'all' ? ` · ${QUADRANTS[filter as keyof typeof QUADRANTS]?.name ?? CLASS_LABEL[filter]}` : ''}`}
                actions={
                  <div className="aa-table-tools">
                    <input
                      type="search"
                      className="aa-search"
                      placeholder="Search dishes"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Search dishes"
                    />
                    <select className="aa-select" value={filter} onChange={(e) => setFilter(e.target.value as EngineeringClass | 'all')} aria-label="Filter by group">
                      <option value="all">All groups</option>
                      {(Object.keys(CLASS_LABEL) as EngineeringClass[]).map((c) => (
                        <option key={c} value={c}>
                          {CLASS_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                }
              >
                <div className="aa-table-wrap">
                  <table className="aa-table">
                    <thead>
                      <tr>
                        {th('name', 'Dish', 'txt')}
                        {th('qty', 'Units')}
                        {th('revenue', 'Revenue')}
                        {th('revenue_change_pct', 'vs prev')}
                        {th('avg_price', 'Avg price')}
                        {th('penetration', 'In % of orders')}
                        {th('avg_rating', 'Rating')}
                        <th className="txt">Group</th>
                        <th className="num" title="Pareto class: A = top 80% of revenue">ABC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((i) => (
                        <tr key={i.item_id} onClick={() => onItem(i.item_id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onItem(i.item_id)}>
                          <td className="txt">
                            <span className="aa-dish">
                              <span className={`aa-veg ${i.is_veg ? 'is-veg' : 'is-nonveg'}`} aria-label={i.is_veg ? 'Veg' : 'Non-veg'} />
                              <span>
                                {i.name}
                                <span className="aa-dish-sub">
                                  {i.category}
                                  {!i.is_active && ' · retired'}
                                  {i.is_active && !i.is_available && ' · out of stock'}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="num">{num(i.qty)}</td>
                          <td className="num">{inr(i.revenue)}</td>
                          <td className="num">
                            <Delta kpi={{ value: i.revenue, previous: i.prev_revenue, change_pct: i.revenue_change_pct }} />
                          </td>
                          <td className="num">{i.qty ? inrExact(i.avg_price) : '—'}</td>
                          <td className="num">{pct(i.penetration)}</td>
                          <td className="num">{i.avg_rating != null ? `${i.avg_rating.toFixed(1)} ★ (${i.rating_count})` : '—'}</td>
                          <td className="txt">
                            <span className="aa-class">
                              <span className={`aa-key aa-key-${i.engineering}`} /> {CLASS_LABEL[i.engineering]}
                            </span>
                          </td>
                          <td className="num">{i.abc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!rows.length && <p className="aa-empty">No dishes match.</p>}
                </div>
              </Card>
            </>
          )
        }}
      </Loader>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Item drill-down
// ---------------------------------------------------------------------------

function ItemView({ range, itemId, onBack, onItem }: { range: Range; itemId: number; onBack: () => void; onItem: (id: number) => void }) {
  const state = useLoad(() => getItemDetail(range, itemId), [range.start, range.end, itemId])
  const [metric, setMetric] = useState<'orders' | 'sales'>('orders')

  return (
    <div className="aa-stack">
      <button type="button" className="aa-crumb" onClick={onBack}>
        ‹ All dishes
      </button>
      <Loader state={state}>
        {(d) => {
          const g = d.period.granularity
          const peakHour = d.by_hour.indexOf(Math.max(...d.by_hour))
          const hours = d.by_hour.map((v, h) => ({ label: h % 3 === 0 ? hourName(h).replace(' ', '') : '', value: v, detail: hourName(h) }))
          const ratings = d.rating_distribution.reduce((a, b) => a + b, 0)
          return (
            <>
              <header className="aa-item-head">
                <h2>
                  <span className={`aa-veg ${d.is_veg ? 'is-veg' : 'is-nonveg'}`} aria-label={d.is_veg ? 'Veg' : 'Non-veg'} /> {d.name}
                </h2>
                <p>
                  {[d.category, d.subcategory].filter(Boolean).join(' › ')} · menu price {inrExact(d.menu_price)}
                  {!d.is_available && ' · currently out of stock'}
                </p>
              </header>

              <div className="aa-stats">
                <StatTile label="Units sold" kpi={d.kpis.qty} format={num} spark={d.trend.map((p) => p.orders)} />
                <StatTile label="Revenue" kpi={d.kpis.revenue} format={inr} spark={d.trend.map((p) => p.sales)} />
                <StatTile label="Orders with it" kpi={d.kpis.orders} format={num} />
                <StatTile label="In % of all orders" kpi={d.kpis.penetration} format={pct} unit="pt" />
                <StatTile label="Avg price realised" kpi={d.kpis.avg_price} format={inrExact} note="incl. variants & toppings" />
                <StatTile
                  label="Rating"
                  kpi={d.kpis.avg_rating}
                  format={(v) => (v ? `${v.toFixed(2)} ★` : '—')}
                  note={`${ratings} rating${ratings === 1 ? '' : 's'}`}
                />
              </div>

              <Card
                title="Trend"
                sub={`By ${g} · this period against the one before`}
                actions={
                  <Seg
                    label="Item trend metric"
                    value={metric}
                    onChange={setMetric}
                    options={[
                      { key: 'orders', label: 'Units' },
                      { key: 'sales', label: 'Revenue' },
                    ]}
                  />
                }
              >
                <LineChart points={trendPoints(d.trend, g, metric)} format={metric === 'sales' ? inr : num} />
              </Card>

              <div className="aa-grid-2">
                <Card title="When it sells" sub={d.kpis.qty.value ? `Peaks around ${hourName(peakHour)}` : undefined}>
                  <Columns data={hours} format={num} highlight={d.kpis.qty.value ? peakHour : null} ariaLabel="Units by hour of day" />
                  <Columns
                    data={d.by_weekday.map((v, i) => ({ label: WEEKDAYS[i], value: v }))}
                    format={num}
                    height={150}
                    ariaLabel="Units by weekday"
                  />
                </Card>
                <Card title="Often bought with" sub="Lift above 1 means they’re ordered together more than chance">
                  <BarList
                    empty="Mostly ordered on its own."
                    rows={d.paired.map((p) => ({
                      key: p.item_id,
                      label: p.name,
                      value: p.orders_together,
                      display: `${pct(p.confidence)} of its orders`,
                      sub: `lift ${p.lift.toFixed(2)}`,
                      onClick: () => onItem(p.item_id),
                    }))}
                  />
                </Card>
                <Card title="How it’s customised" sub={`${pct(d.lines_with_toppings_pct)} of order lines add a topping`}>
                  <h3 className="aa-mini-title">Variants</h3>
                  <BarList
                    empty="No variants chosen."
                    rows={d.variants.map((v) => ({ key: v.id, label: v.name, value: v.count, display: `${num(v.count)} · ${pct(v.share)}` }))}
                  />
                  <h3 className="aa-mini-title">Toppings</h3>
                  <BarList
                    empty="No toppings added."
                    rows={d.toppings.map((v) => ({ key: v.id, label: v.name, value: v.count, display: `${num(v.count)} · ${pct(v.share)}` }))}
                  />
                </Card>
                <Card
                  title="What guests say"
                  sub={`${num(d.customers)} customers bought it · ${num(d.repeat_customers)} came back for it`}
                >
                  <BarList
                    empty="No ratings yet."
                    rows={[5, 4, 3, 2, 1]
                      .filter(() => ratings > 0)
                      .map((s) => ({
                        key: s,
                        label: `${'★'.repeat(s)}`,
                        value: d.rating_distribution[s - 1],
                        display: `${d.rating_distribution[s - 1]}`,
                      }))}
                  />
                  {d.reviews.length > 0 && (
                    <ul className="aa-reviews">
                      {d.reviews.map((r, i) => (
                        <li key={i}>
                          <span className="aa-review-meta">
                            {r.rating ? `${r.rating} ★` : 'No stars'} · {r.customer ?? 'Guest'} · {shortDate(r.created_at)}
                          </span>
                          {r.review && <span className="aa-review-text">“{r.review}”</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </>
          )
        }}
      </Loader>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Traffic (when guests come)
// ---------------------------------------------------------------------------

function TrafficTab({ range }: { range: Range }) {
  const state = useLoad(() => getTimePatterns(range), [range.start, range.end])
  const [metric, setMetric] = useState<'orders' | 'sales'>('orders')

  return (
    <Loader state={state}>
      {(t) => {
        const grid = new Map(t.cells.map((c) => [`${c.weekday}-${c.hour}`, c]))
        const active = t.hour_totals.filter((h) => h.orders > 0).map((h) => h.hour)
        const lo = active.length ? Math.min(...active) : 8
        const hi = active.length ? Math.max(...active) : 22
        const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
        // Per-day averages, so a range with five Mondays and four Sundays still compares fairly.
        const avg = (r: number, c: number) => {
          const cell = grid.get(`${r}-${c}`)
          const days = t.weekday_days[r] || 1
          return cell ? (metric === 'orders' ? cell.orders : cell.sales) / days : 0
        }
        const fmt: Fmt = metric === 'orders' ? (v) => v.toFixed(1) : inr
        const total = t.hour_totals.reduce((s, h) => s + h.orders, 0)
        const days = t.period.days
        const peakDay = t.weekday_totals.reduce(
          (m, w) => {
            const v = w.orders / (t.weekday_days[w.weekday] || 1)
            return v > m.v ? { d: w.weekday, v } : m
          },
          { d: 0, v: -1 },
        )

        return (
          <div className="aa-stack">
            <div className="aa-stats">
              <Plain label="Orders per day" value={(total / days).toFixed(1)} note={`${num(total)} over ${days} day${days === 1 ? '' : 's'}`} />
              <Plain
                label="Busiest slot"
                value={t.peak ? `${WEEKDAYS[t.peak.weekday]} ${hourName(t.peak.hour)}` : '—'}
                note={t.peak ? `${t.peak.orders} orders in total` : undefined}
              />
              <Plain
                label="Busiest day"
                value={total ? WEEKDAYS[peakDay.d] : '—'}
                note={total ? `${peakDay.v.toFixed(1)} orders on an average ${WEEKDAYS[peakDay.d]}` : undefined}
              />
              <Plain
                label="Top daypart"
                value={total ? [...t.dayparts].sort((a, b) => b.orders - a.orders)[0].label : '—'}
                note={total ? `${pct([...t.dayparts].sort((a, b) => b.orders - a.orders)[0].share)} of orders` : undefined}
              />
            </div>

            <Card
              title="Weekly rhythm"
              sub={`Average ${metric === 'orders' ? 'orders' : 'sales'} per day, by weekday and hour — staff up where it’s dark`}
              actions={
                <Seg
                  label="Heatmap metric"
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { key: 'orders', label: 'Orders' },
                    { key: 'sales', label: 'Sales' },
                  ]}
                />
              }
            >
              <Heatmap
                rows={WEEKDAYS}
                cols={hours}
                value={avg}
                format={fmt}
                detail={(r, c) => {
                  const cell = grid.get(`${r}-${c}`)
                  return cell
                    ? `${(cell.orders / (t.weekday_days[r] || 1)).toFixed(1)} orders · ${inr(cell.sales / (t.weekday_days[r] || 1))} per day`
                    : 'no orders'
                }}
              />
            </Card>

            <div className="aa-grid-2">
              <Card title="Dayparts" sub="Where the day’s orders and basket sizes land">
                <div className="aa-table-wrap">
                  <table className="aa-table aa-table-static">
                    <thead>
                      <tr>
                        <th className="txt">Daypart</th>
                        <th className="num">Orders</th>
                        <th className="num">Share</th>
                        <th className="num">Sales</th>
                        <th className="num">Avg order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.dayparts.map((p) => (
                        <tr key={p.key}>
                          <td className="txt">
                            {p.label}
                            <span className="aa-dish-sub">{p.hours}</span>
                          </td>
                          <td className="num">{num(p.orders)}</td>
                          <td className="num">{pct(p.share)}</td>
                          <td className="num">{inr(p.sales)}</td>
                          <td className="num">{p.orders ? inrExact(p.aov) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card title="By weekday" sub="Average orders on each day of the week">
                <Columns
                  data={t.weekday_totals.map((w) => ({
                    label: WEEKDAYS[w.weekday],
                    value: w.orders / (t.weekday_days[w.weekday] || 1),
                    detail: `${inr(w.sales / (t.weekday_days[w.weekday] || 1))} sales on an average day`,
                  }))}
                  format={(v) => v.toFixed(1)}
                  highlight={total ? peakDay.d : null}
                  ariaLabel="Average orders by weekday"
                />
              </Card>
            </div>
          </div>
        )
      }}
    </Loader>
  )
}

// ---------------------------------------------------------------------------
// Baskets
// ---------------------------------------------------------------------------

function BasketsTab({ range, onItem }: { range: Range; onItem: (id: number) => void }) {
  const state = useLoad(() => getBaskets(range), [range.start, range.end])
  return (
    <Loader state={state}>
      {(b) => (
        <div className="aa-stack">
          <div className="aa-stats">
            <Plain label="Items per order" value={b.avg_items.toFixed(2)} note={`${b.avg_lines.toFixed(2)} different dishes`} />
            <Plain label="Single-item orders" value={pct(b.single_item_orders_pct)} note="the easiest upsell opportunity" />
            <Plain label="Lines with a topping" value={pct(b.topping_attach_pct)} note={`≈ ${inr(b.est_topping_revenue)} from toppings`} />
            <Plain label="Lines with a variant" value={pct(b.variant_pick_pct)} note={`${num(b.lines)} order lines in all`} />
          </div>

          <div className="aa-grid-2">
            <Card title="Basket size" sub="Orders by number of items, with the average bill at each size">
              <Columns
                data={b.size_distribution.map((s) => ({
                  label: `${s.size} item${s.size === '1' ? '' : 's'}`,
                  value: s.orders,
                  detail: `${pct(s.share)} of orders · avg bill ${inrExact(s.aov)}`,
                }))}
                format={num}
                ariaLabel="Orders by basket size"
              />
            </Card>
            <Card title="Add-ons" sub="Most-picked toppings and variants (share of units sold)">
              <h3 className="aa-mini-title">Toppings</h3>
              <BarList empty="No toppings added." rows={b.toppings.slice(0, 6).map((t) => ({ key: t.id, label: t.name, value: t.count, display: `${num(t.count)} · ${pct(t.share)}` }))} />
              <h3 className="aa-mini-title">Variants</h3>
              <BarList empty="No variants chosen." rows={b.variants.slice(0, 6).map((t) => ({ key: t.id, label: t.name, value: t.count, display: `${num(t.count)} · ${pct(t.share)}` }))} />
            </Card>
          </div>

          <Card
            title="Bought together"
            sub="The strongest pairings — ideal for combos and “add a …?” prompts. Lift above 1 means more often than chance."
          >
            {b.pairs.length ? (
              <div className="aa-table-wrap">
                <table className="aa-table aa-table-static">
                  <thead>
                    <tr>
                      <th className="txt">Pair</th>
                      <th className="num">Orders together</th>
                      <th className="num">% of all orders</th>
                      <th className="num">A → B</th>
                      <th className="num">B → A</th>
                      <th className="num">Lift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.pairs.map((p) => (
                      <tr key={`${p.a_id}-${p.b_id}`}>
                        <td className="txt">
                          <button type="button" className="aa-link" onClick={() => onItem(p.a_id)}>
                            {p.a_name}
                          </button>{' '}
                          +{' '}
                          <button type="button" className="aa-link" onClick={() => onItem(p.b_id)}>
                            {p.b_name}
                          </button>
                        </td>
                        <td className="num">{num(p.orders_together)}</td>
                        <td className="num">{pct(p.support)}</td>
                        <td className="num" title={`${pct(p.confidence_ab)} of ${p.a_name} orders include ${p.b_name}`}>
                          {pct(p.confidence_ab)}
                        </td>
                        <td className="num" title={`${pct(p.confidence_ba)} of ${p.b_name} orders include ${p.a_name}`}>
                          {pct(p.confidence_ba)}
                        </td>
                        <td className="num">
                          <span className={`aa-lift ${p.lift >= 1.2 ? 'is-strong' : p.lift < 1 ? 'is-weak' : ''}`}>{p.lift.toFixed(2)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="aa-empty">No multi-item orders in this period.</p>
            )}
          </Card>
        </div>
      )}
    </Loader>
  )
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

function CustomerTable({ rows, empty, showDays }: { rows: CustomerRow[]; empty: string; showDays?: boolean }) {
  if (!rows.length) return <p className="aa-empty">{empty}</p>
  return (
    <div className="aa-table-wrap">
      <table className="aa-table aa-table-static">
        <thead>
          <tr>
            <th className="txt">Customer</th>
            <th className="num">Orders</th>
            <th className="num">Spend</th>
            <th className="num">{showDays ? 'Away for' : 'Last order'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.user_id}>
              <td className="txt">
                {c.name || 'Unnamed guest'}
                <span className="aa-dish-sub">{c.email}</span>
              </td>
              <td className="num">{num(c.orders)}</td>
              <td className="num">{inr(c.spend)}</td>
              <td className="num">{showDays ? `${c.days_since} days` : shortDate(c.last_order)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CustomersTab({ range }: { range: Range }) {
  const state = useLoad(() => getCustomers(range), [range.start, range.end])
  return (
    <Loader state={state}>
      {(c) => {
        const g = c.period.granularity
        return (
          <div className="aa-stack">
            <div className="aa-stats">
              <StatTile label="Customers" kpi={c.kpis.customers} format={num} />
              <StatTile label="New customers" kpi={c.kpis.new_customers} format={num} note="first-ever order this period" />
              <StatTile label="Repeat rate" kpi={c.kpis.repeat_rate} format={pct} unit="pt" note="ordered 2+ times this period" />
              <StatTile label="Spend per customer" kpi={c.kpis.spend_per_customer} format={inrExact} />
              <StatTile label="Orders per customer" kpi={c.kpis.orders_per_customer} format={(v) => v.toFixed(2)} />
              <Plain label="Revenue from returning guests" value={pct(c.returning_revenue_share)} note="loyal guests’ share of sales" />
            </div>

            <div className="aa-grid-2">
              <Card title="New vs returning" sub={`Distinct customers by ${g}`}>
                <StackedColumns
                  data={c.trend.map((p) => ({ label: bucketLabel(p.bucket, g), a: p.returning, b: p.new }))}
                  names={['Returning', 'New']}
                  ariaLabel="New and returning customers over time"
                />
              </Card>
              <Card title="Visit frequency" sub="How often each customer ordered in the period — and what each group spent">
                <BarList
                  rows={c.frequency.map((f) => ({
                    key: f.label,
                    label: f.label,
                    value: f.customers,
                    display: `${num(f.customers)} · ${pct(f.share)}`,
                    sub: `${inr(f.revenue)} spent`,
                  }))}
                />
              </Card>
              <Card title="Top customers" sub="Highest spend this period">
                <CustomerTable rows={c.top} empty="No customers this period." />
              </Card>
              <Card title="Win them back" sub="Regulars (3+ orders) who haven’t ordered in 3 weeks — worth a personal nudge">
                <CustomerTable rows={c.lapsed} empty="No lapsed regulars — everyone’s still coming in." showDays />
              </Card>
            </div>
          </div>
        )
      }}
    </Loader>
  )
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

function OperationsTab({ range }: { range: Range }) {
  const state = useLoad(() => getOperations(range), [range.start, range.end])
  return (
    <Loader state={state}>
      {(o) => {
        const g = o.period.granularity
        const statusRows = o.statuses.filter((s) => s.status !== 'cart')
        const hours = o.settle_by_hour.map((v, h) => ({ h, v })).filter((x) => x.v != null) as { h: number; v: number }[]
        return (
          <div className="aa-stack">
            <div className="aa-stats">
              <StatTile label="Cancellation rate" kpi={o.cancellation_rate} format={pct} unit="pt" invert note={`${inr(o.cancelled_value)} cancelled`} />
              <Plain label="Placed → paid (median)" value={minutes(o.settle_minutes_median)} note={`90% settle within ${minutes(o.settle_minutes_p90)}`} />
              <Plain label="Average time to settle" value={minutes(o.settle_minutes_avg)} note="from order to payment" />
              <Plain label="Abandoned carts" value={num(o.abandoned_carts)} note={`${inr(o.abandoned_cart_value)} left in carts`} />
            </div>

            <div className="aa-grid-2">
              <Card title="Where orders ended up" sub="Orders placed this period by their current status">
                <BarList
                  rows={statusRows.map((s) => ({
                    key: s.status,
                    label: STATUS_LABEL[s.status] ?? s.status,
                    value: s.orders,
                    display: num(s.orders),
                    sub: inr(s.value),
                  }))}
                />
              </Card>
              <Card title="Orders in flight" sub="Live — what the floor is handling right now">
                <BarList
                  empty="Nothing open right now."
                  rows={o.pipeline.map((p) => ({
                    key: p.status,
                    label: STATUS_LABEL[p.status],
                    value: p.orders,
                    display: `${p.orders} · ${inr(p.value)}`,
                    sub: p.oldest_minutes != null ? `oldest ${minutes(p.oldest_minutes)}` : undefined,
                  }))}
                />
              </Card>
              <Card title="Time to settle by hour" sub="Average minutes from order to payment — long bars mean slow service or slow billing">
                {hours.length ? (
                  <Columns
                    data={hours.map((x) => ({ label: hourName(x.h).replace(' ', ''), value: x.v, detail: `${hourName(x.h)} orders` }))}
                    format={(v) => `${Math.round(v)}m`}
                    ariaLabel="Average minutes to settle by hour"
                  />
                ) : (
                  <p className="aa-empty">No paid orders in this period.</p>
                )}
              </Card>
              <Card title="Cancellations over time" sub={`Cancelled orders by ${g}`}>
                <Columns
                  data={o.trend.map((p) => ({
                    label: bucketLabel(p.bucket, g),
                    value: p.cancelled,
                    detail: `${p.cancelled} of ${p.orders + p.cancelled} placed`,
                  }))}
                  format={num}
                  labelEvery={Math.max(1, Math.ceil(o.trend.length / 7))}
                  ariaLabel="Cancelled orders over time"
                />
              </Card>
            </div>
          </div>
        )
      }}
    </Loader>
  )
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

type Tab = 'overview' | 'menu' | 'traffic' | 'baskets' | 'customers' | 'operations'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'menu', label: 'Menu' },
  { key: 'traffic', label: 'Busy hours' },
  { key: 'baskets', label: 'Baskets' },
  { key: 'customers', label: 'Customers' },
  { key: 'operations', label: 'Service' },
]

/** Admin analytics: sales, menu engineering, traffic, baskets, customers and
 *  service health for any date range, always compared with the period before. */
export default function AdminAnalytics({ onBack }: Props) {
  const [preset, setPreset] = useState<Preset>('30d')
  const [range, setRange] = useState<Range>(() => presetRange('30d'))
  const [custom, setCustom] = useState<Range>(range)
  const [tab, setTab] = useState<Tab>('overview')
  const [itemId, setItemId] = useState<number | null>(null)
  const [refresh, setRefresh] = useState(0)

  const pickPreset = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') setRange(presetRange(p))
  }
  const customValid = custom.start && custom.end && custom.start <= custom.end
  const applyCustom = () => customValid && setRange({ ...custom })

  const openItem = useCallback((id: number) => {
    setItemId(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // A refresh re-keys the range so every tab refetches past the cache.
  const keyed = useMemo(() => ({ ...range, _r: refresh }), [range, refresh])
  const p = useMemo(() => {
    const days = Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) + 1
    const start = new Date(Date.parse(range.start) - days * 86400000)
    const end = new Date(Date.parse(range.start) - 86400000)
    return periodText({ start: range.start, end: range.end, prev_start: start.toISOString().slice(0, 10), prev_end: end.toISOString().slice(0, 10), days, granularity: 'day' })
  }, [range])

  return (
    <div className="screen menu-screen mgr-screen aa">
      <header className="cafe-header">
        <div className="brand">
          <button type="button" className="hdr-back" onClick={onBack} aria-label="Back">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="brand-stack">
            <span className="brand-name">Seoulmate Cafe</span>
          </div>
        </div>
        <div className="hdr-actions">
          <span className="admin-badge">Admin</span>
        </div>
      </header>

      <div className="aa-head">
        <div>
          <h1 className="menu-title">Analytics</h1>
          <p className="aa-period">
            <strong>{p.current}</strong>
            <span> compared with {p.previous}</span>
          </p>
        </div>
        <button
          type="button"
          className="aa-refresh"
          onClick={() => {
            clearAnalyticsCache()
            setRefresh((r) => r + 1)
          }}
        >
          ↻ Refresh
        </button>
      </div>

      <div className="aa-controls">
        <div className="aa-pills aa-presets" role="radiogroup" aria-label="Date range">
          {PRESETS.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={preset === x.key} className={preset === x.key ? 'is-on' : ''} onClick={() => pickPreset(x.key)}>
              {x.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <form
            className="aa-custom"
            onSubmit={(e) => {
              e.preventDefault()
              applyCustom()
            }}
          >
            <label>
              From
              <input type="date" value={custom.start} max={custom.end} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} />
            </label>
            <label>
              To
              <input type="date" value={custom.end} min={custom.start} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} />
            </label>
            <button type="submit" className="aa-apply" disabled={!customValid}>
              Show range
            </button>
          </form>
        )}
      </div>

      <nav className="aa-tabs" aria-label="Analytics sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key && itemId == null ? 'is-on' : ''}
            aria-current={tab === t.key && itemId == null ? 'page' : undefined}
            onClick={() => {
              setItemId(null)
              setTab(t.key)
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="aa-body" key={`${keyed.start}-${keyed.end}-${keyed._r}`}>
        {itemId != null ? (
          <ItemView range={range} itemId={itemId} onBack={() => setItemId(null)} onItem={openItem} />
        ) : tab === 'overview' ? (
          <OverviewTab range={range} onTab={setTab} />
        ) : tab === 'menu' ? (
          <MenuTab range={range} onItem={openItem} />
        ) : tab === 'traffic' ? (
          <TrafficTab range={range} />
        ) : tab === 'baskets' ? (
          <BasketsTab range={range} onItem={openItem} />
        ) : tab === 'customers' ? (
          <CustomersTab range={range} />
        ) : (
          <OperationsTab range={range} />
        )}
      </main>
    </div>
  )
}
