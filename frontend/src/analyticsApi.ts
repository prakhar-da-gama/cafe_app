// API client for the admin analytics page (backend: routers/analyticsadmin.py).
// Kept separate from api.ts so the analytics feature is self-contained.

import { getToken, redirectToLogin } from './api'

// ---- Types (mirror the response models in analyticsadmin.py) ----

export interface Period {
  start: string
  end: string
  prev_start: string
  prev_end: string
  days: number
  granularity: 'hour' | 'day' | 'week' | 'month'
}

export interface Kpi {
  value: number
  previous: number
  change_pct: number | null
}

export interface TrendPoint {
  bucket: string
  prev_bucket: string
  sales: number
  orders: number
  aov: number
  prev_sales: number
  prev_orders: number
  prev_aov: number
}

export interface PipelineStage {
  status: string
  orders: number
  value: number
  oldest_minutes: number | null
}

export type OverviewKpiKey =
  | 'net_sales'
  | 'orders'
  | 'aov'
  | 'items_sold'
  | 'items_per_order'
  | 'customers'
  | 'new_customers'
  | 'returning_customers'
  | 'repeat_rate'
  | 'orders_per_customer'
  | 'collected'
  | 'outstanding'
  | 'cancelled_orders'
  | 'cancelled_value'
  | 'cancellation_rate'
  | 'avg_rating'
  | 'ratings'
  | 'sales_per_day'

export interface Overview {
  period: Period
  kpis: Record<OverviewKpiKey, Kpi>
  trend: TrendPoint[]
  pipeline: PipelineStage[]
}

export interface HeatCell {
  weekday: number
  hour: number
  orders: number
  sales: number
}

export interface Daypart {
  key: string
  label: string
  hours: string
  orders: number
  sales: number
  aov: number
  share: number
}

export interface TimePatterns {
  period: Period
  cells: HeatCell[]
  weekday_days: number[]
  weekday_totals: HeatCell[]
  hour_totals: HeatCell[]
  dayparts: Daypart[]
  peak: HeatCell | null
}

export type EngineeringClass = 'star' | 'plowhorse' | 'puzzle' | 'dog' | 'no_sales'

export interface ItemRow {
  item_id: number
  name: string
  category_id: number | null
  category: string | null
  subcategory: string | null
  is_veg: boolean
  is_available: boolean
  is_active: boolean
  menu_price: number
  qty: number
  revenue: number
  orders: number
  avg_price: number
  qty_share: number
  revenue_share: number
  penetration: number
  prev_qty: number
  prev_revenue: number
  revenue_change_pct: number | null
  avg_rating: number | null
  rating_count: number
  last_sold: string | null
  engineering: EngineeringClass
  abc: 'A' | 'B' | 'C' | '-'
}

export interface CategoryMix {
  category_id: number | null
  category: string
  qty: number
  revenue: number
  revenue_share: number
  prev_revenue: number
  revenue_change_pct: number | null
  items_sold: number
}

export interface ItemsAnalytics {
  period: Period
  total_orders: number
  total_qty: number
  total_revenue: number
  menu_size: number
  items_sold: number
  popularity_threshold: number
  avg_item_price: number
  engineering_counts: Partial<Record<EngineeringClass, number>>
  items: ItemRow[]
  categories: CategoryMix[]
}

export interface NamedCount {
  id: number
  name: string
  count: number
  share: number
}

export interface PairedItem {
  item_id: number
  name: string
  orders_together: number
  confidence: number
  lift: number
}

export interface Review {
  rating: number | null
  review: string | null
  customer: string | null
  created_at: string
}

export interface ItemDetail {
  period: Period
  item_id: number
  name: string
  category: string | null
  subcategory: string | null
  menu_price: number
  is_veg: boolean
  is_available: boolean
  kpis: Record<'qty' | 'revenue' | 'orders' | 'avg_price' | 'penetration' | 'avg_rating', Kpi>
  trend: TrendPoint[]
  by_hour: number[]
  by_weekday: number[]
  variants: NamedCount[]
  toppings: NamedCount[]
  lines_with_toppings_pct: number
  paired: PairedItem[]
  rating_distribution: number[]
  reviews: Review[]
  customers: number
  repeat_customers: number
}

export interface SizeBucket {
  size: string
  orders: number
  share: number
  aov: number
}

export interface Pair {
  a_id: number
  a_name: string
  b_id: number
  b_name: string
  orders_together: number
  support: number
  confidence_ab: number
  confidence_ba: number
  lift: number
}

export interface Baskets {
  period: Period
  total_orders: number
  avg_items: number
  avg_lines: number
  single_item_orders_pct: number
  size_distribution: SizeBucket[]
  pairs: Pair[]
  lines: number
  topping_attach_pct: number
  variant_pick_pct: number
  toppings: NamedCount[]
  variants: NamedCount[]
  est_topping_revenue: number
}

export interface FrequencyBucket {
  label: string
  customers: number
  share: number
  revenue: number
}

export interface CustomerRow {
  user_id: number
  name: string | null
  email: string
  orders: number
  spend: number
  last_order: string
  days_since: number
}

export interface Customers {
  period: Period
  kpis: Record<
    | 'customers'
    | 'new_customers'
    | 'returning_customers'
    | 'repeat_rate'
    | 'orders_per_customer'
    | 'spend_per_customer',
    Kpi
  >
  frequency: FrequencyBucket[]
  trend: { bucket: string; new: number; returning: number }[]
  top: CustomerRow[]
  lapsed: CustomerRow[]
  returning_revenue_share: number
}

export interface Operations {
  period: Period
  statuses: { status: string; orders: number; value: number }[]
  cancellation_rate: Kpi
  cancelled_value: number
  abandoned_carts: number
  abandoned_cart_value: number
  settle_minutes_avg: number | null
  settle_minutes_median: number | null
  settle_minutes_p90: number | null
  settle_by_hour: (number | null)[]
  trend: { bucket: string; orders: number; cancelled: number }[]
  pipeline: PipelineStage[]
}

// ---- Fetching ----

export interface Range {
  start: string // YYYY-MM-DD
  end: string
}

// Responses are cached briefly per URL so flipping between tabs (or back from
// an item drill-down) is instant, while a reopened page still gets fresh data.
const CACHE_MS = 60_000
const cache = new Map<string, { at: number; data: Promise<unknown> }>()

function get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v))
  const url = `/api/admin/analytics${path}?${qs.toString()}`
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as Promise<T>

  const token = getToken()
  const data = fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(async (res) => {
    if (res.status === 401 && getToken()) {
      redirectToLogin()
      throw new Error('Session expired')
    }
    if (!res.ok) {
      let detail = res.statusText
      try {
        detail = (await res.json()).detail ?? detail
      } catch {
        /* non-JSON error body */
      }
      throw new Error(detail)
    }
    return res.json() as Promise<T>
  })
  cache.set(url, { at: Date.now(), data })
  data.catch(() => cache.delete(url)) // never cache failures
  return data
}

/** Drop cached responses so the next load hits the server (the Refresh button). */
export function clearAnalyticsCache(): void {
  cache.clear()
}

export const getOverview = (r: Range) => get<Overview>('/overview', { ...r })
export const getTimePatterns = (r: Range) => get<TimePatterns>('/time-patterns', { ...r })
export const getItemsAnalytics = (r: Range, categoryId?: number) =>
  get<ItemsAnalytics>('/items', { ...r, category_id: categoryId })
export const getItemDetail = (r: Range, itemId: number) =>
  get<ItemDetail>(`/items/${itemId}`, { ...r })
export const getBaskets = (r: Range) => get<Baskets>('/baskets', { ...r })
export const getCustomers = (r: Range) => get<Customers>('/customers', { ...r })
export const getOperations = (r: Range) => get<Operations>('/operations', { ...r })
