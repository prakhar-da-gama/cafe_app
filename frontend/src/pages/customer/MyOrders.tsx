import { useCallback, useEffect, useState } from 'react'
import {
  listCurrentOrders,
  listPastOrders,
  money,
  type Order,
  type OrderStatus,
  type PaginatedOrders,
} from '../../api'
import CafeHeader from '../../components/CafeHeader'
import OrderLines from '../../components/OrderLines'
import ServiceReviewCard from '../../components/ServiceReviewCard'

// The three views: current (active) orders, past paid orders, and cancelled
// orders. Current comes from /api/orders/current; the other two from
// /api/orders/past filtered to the matching terminal status.
type OrdersTab = 'current' | 'past' | 'cancelled'

interface Props {
  /** Which tab to open on. */
  initialTab?: OrdersTab
  onBack: () => void
  onViewMenu: () => void
}

const TABS: { key: OrdersTab; label: string }[] = [
  { key: 'current', label: 'current orders' },
  { key: 'past', label: 'past orders' },
  { key: 'cancelled', label: 'cancelled' },
]

// Fetch one page for a tab from its backing endpoint.
const fetchTab = (tab: OrdersTab, page: number): Promise<PaginatedOrders> => {
  if (tab === 'current') return listCurrentOrders(page, PAGE_SIZE)
  if (tab === 'past') return listPastOrders('payment_completed', page, PAGE_SIZE)
  return listPastOrders('cancelled', page, PAGE_SIZE)
}

// Pretty labels for the per-order status badge (raw enum values have underscores).
const STATUS_LABELS: Record<OrderStatus, string> = {
  cart: 'cart',
  received: 'received',
  preparing: 'preparing',
  ready: 'ready to serve',
  payment_pending: 'payment pending',
  payment_completed: 'paid',
  cancelled: 'cancelled',
}

// An order is reviewable once it's been handed over (delivered), i.e. from
// payment_pending onwards.
const isReviewable = (s: OrderStatus) =>
  s === 'payment_pending' || s === 'payment_completed'

const PAGE_SIZE = 10

/** The user's orders across three tabs (current / past / cancelled), each paged
 *  on the orders table, following the menu's design language. */
export default function MyOrders({
  initialTab = 'current',
  onBack,
  onViewMenu,
}: Props) {
  const [tab, setTab] = useState<OrdersTab>(initialTab)
  const [orders, setOrders] = useState<Order[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (which: OrdersTab, next: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchTab(which, next)
      setOrders((prev) => (next === 1 ? res.items : [...prev, ...res.items]))
      setPage(res.page)
      setHasMore(res.has_more)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reset and refetch the first page whenever the tab changes.
  useEffect(() => {
    setOrders([])
    load(tab, 1)
  }, [tab, load])

  // Fold a saved line review back into local state so the card stays in sync
  // without a refetch.
  const handleLineReviewed = useCallback(
    (
      orderId: number,
      lineId: number,
      changes: {
        rating: number | null
        review: string | null
        review_photo_paths: string[]
      },
    ) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id !== orderId
            ? o
            : {
                ...o,
                order_items: o.order_items.map((l) =>
                  l.id === lineId ? { ...l, ...changes } : l,
                ),
              },
        ),
      )
    },
    [],
  )

  return (
    <div className="screen menu-screen">
      <CafeHeader onBack={onBack} onViewMenu={onViewMenu} />

      <div className="menu-head">
        <h1 className="menu-title">My orders</h1>
        <nav className="cat-nav orders-filter" aria-label="Filter orders">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              type="button"
              className={t.key === tab ? 'cat-pill cat-on' : 'cat-pill'}
              data-candy={(i % 8) + 1}
              onClick={() => setTab(t.key)}
              aria-pressed={t.key === tab}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {error && <p className="form-error center">{error}</p>}
      {!loading && !error && orders.length === 0 && (
        <p className="muted center">
          No {TABS.find((t) => t.key === tab)?.label} yet.
        </p>
      )}

      <div className="order-list">
        {orders.map((order) => (
          <section key={order.id} className="order-card">
            <div className="order-card-head">
              <div className="order-id-wrap">
                <span className="order-id">Order #{order.id}</span>
                <span className="order-when">
                  {new Date(order.created_at).toLocaleString()}
                </span>
              </div>
              <span className={`status-badge status-${order.status}`}>
                {STATUS_LABELS[order.status]}
              </span>
            </div>

            <OrderLines
              lines={order.order_items}
              reviewable={isReviewable(order.status)}
              onLineReviewed={(lineId, changes) =>
                handleLineReviewed(order.id, lineId, changes)
              }
            />

            <div className="cart-total-row">
              <span>Total</span>
              <span className="cart-total">{money(order.total_amount)}</span>
            </div>

            {isReviewable(order.status) && (
              <ServiceReviewCard orderId={order.id} />
            )}
          </section>
        ))}
      </div>

      {loading && <p className="muted center">Loading orders…</p>}
      {!loading && hasMore && (
        <button
          type="button"
          className="candy-btn btn-grape load-more"
          onClick={() => load(tab, page + 1)}
        >
          Load more
        </button>
      )}
    </div>
  )
}
