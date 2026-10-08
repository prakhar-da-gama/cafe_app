import { useCallback, useEffect, useState } from 'react'
import {
  listAllOrders,
  money,
  signedMoney,
  updateOrder,
  type Order,
  type OrderStatus,
} from '../api'
import OrderLines from '../components/OrderLines'

const STATUSES: OrderStatus[] = [
  'pending',
  'preparing',
  'ready',
  'completed',
  'cancelled',
]
const PAGE_SIZE = 10

const drinkCount = (o: Order) =>
  o.order_items.reduce((s, l) => s + l.quantity, 0)
const orderTotal = (o: Order) =>
  o.order_items.reduce((s, l) => s + Number(l.price) * l.quantity, 0)

/** The manager dashboard: all orders for a chosen status, newest first, with
 *  the kitchen workflow controls that differ per status. */
export default function ManagerOrders() {
  const [status, setStatus] = useState<OrderStatus>('pending')
  const [orders, setOrders] = useState<Order[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  // Which line items the manager has ticked "prepared", per order (session only).
  const [prepared, setPrepared] = useState<Record<number, Set<number>>>({})

  const load = useCallback(async (which: OrderStatus, next: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await listAllOrders(which, next, PAGE_SIZE)
      setOrders((prev) => (next === 1 ? res.items : [...prev, ...res.items]))
      setPage(res.page)
      setHasMore(res.has_more)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reset everything and refetch whenever the status filter changes.
  useEffect(() => {
    setOrders([])
    setExpandedId(null)
    setPrepared({})
    load(status, 1)
  }, [status, load])

  const toggleExpand = (id: number) =>
    setExpandedId((cur) => (cur === id ? null : id))

  // Apply a manager action. `remove` drops the order from the current list
  // (its status moved out of the active filter); otherwise it's updated in place.
  const act = async (
    order: Order,
    changes: { status?: OrderStatus; payment_status?: boolean },
    remove: boolean,
  ) => {
    setBusyId(order.id)
    setError(null)
    try {
      const updated = await updateOrder(order.id, changes)
      if (remove) {
        setOrders((prev) => prev.filter((o) => o.id !== order.id))
        setExpandedId((cur) => (cur === order.id ? null : cur))
      } else {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)))
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const togglePrepared = (orderId: number, lineId: number) =>
    setPrepared((prev) => {
      const set = new Set(prev[orderId] ?? [])
      if (set.has(lineId)) set.delete(lineId)
      else set.add(lineId)
      return { ...prev, [orderId]: set }
    })

  const allPrepared = (order: Order) => {
    const set = prepared[order.id] ?? new Set<number>()
    return (
      order.order_items.length > 0 &&
      order.order_items.every((l) => set.has(l.id))
    )
  }

  return (
    <div className="mgr-orders">
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

      {error && <p className="form-error center">{error}</p>}
      {!loading && !error && orders.length === 0 && (
        <p className="muted center">No {status} orders.</p>
      )}

      <div className="order-list">
        {orders.map((order) => {
          const expanded = expandedId === order.id
          const prepSet = prepared[order.id] ?? new Set<number>()
          return (
            <section key={order.id} className="order-card mgr-order">
              <button
                type="button"
                className="mgr-head"
                onClick={() => toggleExpand(order.id)}
                aria-expanded={expanded}
              >
                <span className="order-id-wrap">
                  <span className="order-id">Order #{order.id}</span>
                  <span className="order-when">
                    {new Date(order.created_at).toLocaleString()}
                  </span>
                </span>
                <span className="mgr-head-right">
                  <span className="order-summary">
                    {drinkCount(order)} drinks · {money(orderTotal(order))}
                  </span>
                  <span className={`status-badge status-${order.status}`}>
                    {order.status}
                  </span>
                  <span className={expanded ? 'chev chev-up' : 'chev'} aria-hidden>
                    ⌄
                  </span>
                </span>
              </button>

              {/* Row-level actions that don't require expanding. */}
              {order.status === 'ready' && (
                <div className="mgr-row-actions">
                  <button
                    type="button"
                    className="candy-btn btn-mint sm"
                    onClick={() => act(order, { status: 'completed' }, true)}
                    disabled={busyId === order.id}
                  >
                    Mark completed
                  </button>
                </div>
              )}
              {order.status === 'completed' && (
                <div className="mgr-row-actions">
                  {order.payment_status ? (
                    <span className="paid-tag">Paid ✓</span>
                  ) : (
                    <button
                      type="button"
                      className="candy-btn btn-sun sm"
                      onClick={() => act(order, { payment_status: true }, false)}
                      disabled={busyId === order.id}
                    >
                      Mark paid
                    </button>
                  )}
                </div>
              )}

              {expanded && (
                <div className="mgr-detail">
                  {order.status === 'preparing' ? (
                    <>
                      <div className="prep-list">
                        {order.order_items.map((line) => {
                          const done = prepSet.has(line.id)
                          return (
                            <div
                              key={line.id}
                              className={done ? 'prep-row prep-done' : 'prep-row'}
                            >
                              <div className="prep-info">
                                <div className="prep-name-row">
                                  <span
                                    className={
                                      line.item.is_veg
                                        ? 'veg-dot veg'
                                        : 'veg-dot nonveg'
                                    }
                                  />
                                  <span className="prep-name">
                                    {line.item.name}
                                    {line.quantity > 1 && ` ×${line.quantity}`}
                                  </span>
                                </div>
                                {(line.variants.length > 0 ||
                                  line.toppings.length > 0) && (
                                  <div className="opt-chips">
                                    {line.variants.map((v) => (
                                      <span key={`v${v.id}`} className="opt-chip">
                                        {v.name}
                                        <em>{signedMoney(v.price_delta)}</em>
                                      </span>
                                    ))}
                                    {line.toppings.map((t) => (
                                      <span
                                        key={`t${t.id}`}
                                        className="opt-chip opt-topping"
                                      >
                                        {t.name}
                                        <em>{signedMoney(t.price)}</em>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                className={done ? 'prep-btn prep-on' : 'prep-btn'}
                                onClick={() => togglePrepared(order.id, line.id)}
                                aria-pressed={done}
                              >
                                {done ? 'Prepared ✓' : 'Prepared'}
                              </button>
                            </div>
                          )
                        })}
                      </div>

                      <button
                        type="button"
                        className="candy-btn btn-grape mgr-full-btn"
                        onClick={() => act(order, { status: 'ready' }, true)}
                        disabled={!allPrepared(order) || busyId === order.id}
                      >
                        {allPrepared(order)
                          ? 'Order is Ready'
                          : 'Mark every item prepared first'}
                      </button>
                    </>
                  ) : (
                    <OrderLines lines={order.order_items} />
                  )}

                  {order.status === 'pending' && (
                    <div className="mgr-actions">
                      <button
                        type="button"
                        className="mgr-cancel"
                        onClick={() => act(order, { status: 'cancelled' }, true)}
                        disabled={busyId === order.id}
                      >
                        Cancel order
                      </button>
                      <button
                        type="button"
                        className="candy-btn btn-mint"
                        onClick={() => act(order, { status: 'preparing' }, true)}
                        disabled={busyId === order.id}
                      >
                        Prepare
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )
        })}
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
