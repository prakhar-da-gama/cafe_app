import { useCallback, useEffect, useState } from 'react'
import { listOrders, money, type Order, type OrderStatus } from '../../api'
import CafeHeader from '../../components/CafeHeader'
import OrderLines from '../../components/OrderLines'
import ServiceReviewCard from '../../components/ServiceReviewCard'

interface Props {
  /** Which status the filter opens on (e.g. `preparing` from the menus). */
  initialStatus?: OrderStatus
  onBack: () => void
  onViewMenu: () => void
}

// The placed-order statuses the filter offers (the open cart lives on its own
// page, so it isn't listed here).
const STATUSES: OrderStatus[] = [
  'received',
  'preparing',
  'ready',
  'payment_pending',
  'payment_completed',
  'cancelled',
]

// Pretty labels for the status pills / badge (raw enum values have underscores).
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

/** All of the user's placed orders, filterable by status and paged on the
 *  orders table, following the menu's design language. */
export default function MyOrders({
  initialStatus = 'received',
  onBack,
  onViewMenu,
}: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus)
  const [orders, setOrders] = useState<Order[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (which: OrderStatus, next: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await listOrders(which, next, PAGE_SIZE)
      setOrders((prev) => (next === 1 ? res.items : [...prev, ...res.items]))
      setPage(res.page)
      setHasMore(res.has_more)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reset and refetch the first page whenever the status filter changes.
  useEffect(() => {
    setOrders([])
    load(status, 1)
  }, [status, load])

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
        <nav className="cat-nav orders-filter" aria-label="Filter by status">
          {STATUSES.map((s, i) => (
            <button
              key={s}
              type="button"
              className={s === status ? 'cat-pill cat-on' : 'cat-pill'}
              data-candy={(i % 8) + 1}
              onClick={() => setStatus(s)}
              aria-pressed={s === status}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </nav>
      </div>

      {error && <p className="form-error center">{error}</p>}
      {!loading && !error && orders.length === 0 && (
        <p className="muted center">No {status} orders yet.</p>
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
          onClick={() => load(status, page + 1)}
        >
          Load more
        </button>
      )}
    </div>
  )
}
