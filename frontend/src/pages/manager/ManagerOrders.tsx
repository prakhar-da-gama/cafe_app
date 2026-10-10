import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listAllOrders,
  money,
  signedMoney,
  updateOrder,
  type Order,
  type OrderStatus,
} from '../../api'
import OrderLines from '../../components/OrderLines'

const STATUSES: OrderStatus[] = [
  'pending',
  'preparing',
  'ready',
  'completed',
  'cancelled',
]
const PAGE_SIZE = 10

// Looping chime played while there are new, unopened pending orders.
const NEW_ORDER_SOUND = '/new-order.mp3'
// How often to check for newly-arrived pending orders.
const POLL_MS = 8000

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

  // --- New-order alarm (pending only) --------------------------------------
  // Pending order IDs that arrived this session but the manager hasn't opened
  // yet. The chime loops while this set is non-empty and stops once every new
  // order has been opened at least once.
  const [unacked, setUnacked] = useState<Set<number>>(new Set())
  // Pending IDs already noticed, so a poll only alarms genuinely new arrivals
  // (not the orders already on screen when the dashboard opened).
  const seenRef = useRef<Set<number>>(new Set())
  // Orders opened (expanded) at least once — these never alarm again.
  const openedRef = useRef<Set<number>>(new Set())
  const baselineRef = useRef(false)
  // Exactly one <audio> element drives the alarm (never overlapping streams).
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Latest selected status, read inside the background poll without resubscribing.
  const statusRef = useRef(status)
  statusRef.current = status

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

  // A single looping <audio> element drives the alarm. Keeping exactly one
  // element (and only ever toggling play/pause) guarantees the sound never
  // stacks into overlapping playbacks when several orders arrive at once.
  useEffect(() => {
    const audio = new Audio(NEW_ORDER_SOUND)
    audio.loop = true
    audio.preload = 'auto'
    audioRef.current = audio

    // Browsers block timer-triggered playback until the user interacts with the
    // page. Prime (muted) on the first interaction so later alarms can play
    // even if the manager landed straight on the dashboard via a saved token.
    const unlock = () => {
      audio.muted = true
      audio
        .play()
        .then(() => {
          audio.pause()
          audio.currentTime = 0
          audio.muted = false
        })
        .catch(() => {
          audio.muted = false
        })
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      audio.pause()
      audioRef.current = null
    }
  }, [])

  // Start/stop the single alarm stream as the unacknowledged set changes.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (unacked.size > 0) {
      // Only (re)start if it isn't already looping — never stack playbacks.
      if (audio.paused) {
        audio.currentTime = 0
        audio.play().catch(() => {
          /* autoplay still blocked; retried when the set next changes */
        })
      }
    } else if (!audio.paused) {
      audio.pause()
      audio.currentTime = 0
    }
  }, [unacked])

  // Poll pending orders in the background (independent of the selected tab) so
  // a new order rings even while the manager is viewing another status. One
  // request at a time — `inFlight` stops overlapping polls from piling up.
  useEffect(() => {
    let alive = true
    let inFlight = false

    const tick = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const res = await listAllOrders('pending', 1, PAGE_SIZE)
        if (!alive) return
        const pendingIds = new Set(res.items.map((o) => o.id))

        if (!baselineRef.current) {
          // First poll: remember what's already there without alarming.
          res.items.forEach((o) => seenRef.current.add(o.id))
          baselineRef.current = true
        } else {
          const fresh = res.items.filter((o) => !seenRef.current.has(o.id))
          fresh.forEach((o) => seenRef.current.add(o.id))
          const toAlert = fresh.filter((o) => !openedRef.current.has(o.id))
          if (toAlert.length > 0) {
            setUnacked((prev) => {
              const next = new Set(prev)
              toAlert.forEach((o) => next.add(o.id))
              return next
            })
            // If the manager is on the pending tab, surface the new orders at
            // the top of the list so they can be opened to silence the alarm.
            if (statusRef.current === 'pending') {
              setOrders((prev) => {
                const have = new Set(prev.map((o) => o.id))
                const add = fresh.filter((o) => !have.has(o.id))
                return add.length > 0 ? [...add, ...prev] : prev
              })
            }
          }
        }

        // Drop anything no longer pending (advanced or cancelled elsewhere) so
        // the alarm can't get stuck on an order that left the queue.
        setUnacked((prev) => {
          if (prev.size === 0) return prev
          let changed = false
          const next = new Set<number>()
          prev.forEach((id) => {
            if (pendingIds.has(id)) next.add(id)
            else changed = true
          })
          return changed ? next : prev
        })
      } catch {
        /* transient network error; try again on the next tick */
      } finally {
        inFlight = false
      }
    }

    tick()
    const handle = window.setInterval(tick, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Opening a pending order silences its share of the alarm.
  const acknowledge = (id: number) => {
    openedRef.current.add(id)
    setUnacked((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const toggleExpand = (id: number) =>
    setExpandedId((cur) => {
      const opening = cur !== id
      if (opening) acknowledge(id)
      return opening ? id : null
    })

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
