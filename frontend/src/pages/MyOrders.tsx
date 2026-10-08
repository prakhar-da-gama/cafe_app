import { useCallback, useEffect, useState } from 'react'
import { listOrders, money, type Order, type OrderStatus } from '../api'
import CafeHeader from '../components/CafeHeader'
import OrderLines from '../components/OrderLines'

interface Props {
  /** Which status the filter opens on (e.g. `pending` from the menus). */
  initialStatus?: OrderStatus
  onBack: () => void
  onViewMenu: () => void
}

// The placed-order statuses the filter offers (the open cart lives on its own
// page, so it isn't listed here).
const STATUSES: OrderStatus[] = [
  'pending',
  'preparing',
  'ready',
  'completed',
  'cancelled',
]
const PAGE_SIZE = 10

/** All of the user's placed orders, filterable by status and paged on the
 *  orders table, following the menu's design language. */
export default function MyOrders({
  initialStatus = 'pending',
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
              {s}
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
                {order.status}
              </span>
            </div>

            <OrderLines lines={order.order_items} />

            <div className="cart-total-row">
              <span>Total</span>
              <span className="cart-total">{money(order.total_amount)}</span>
            </div>
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
