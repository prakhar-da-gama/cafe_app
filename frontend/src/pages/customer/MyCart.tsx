import { useCallback, useEffect, useState } from 'react'
import { listOrders, money, placeOrder, type Order } from '../../api'
import CafeHeader from '../../components/CafeHeader'
import OrderLines from '../../components/OrderLines'

interface Props {
  onBack: () => void
  onViewMenu: () => void
  onOpenOrders: () => void
  /** Called after the cart is successfully placed. */
  onPlaced: () => void
}

/** The cart: the user's open draft order, laid out in the menu's design
 *  language, with a button to place it (→ pending) and a way into past orders. */
export default function MyCart({
  onBack,
  onViewMenu,
  onOpenOrders,
  onPlaced,
}: Props) {
  const [cart, setCart] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    let alive = true
    listOrders('cart')
      .then((res) => alive && setCart(res.items[0] ?? null))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const lines = cart?.order_items ?? []
  const total = lines.reduce((s, l) => s + Number(l.price) * l.quantity, 0)

  const place = useCallback(async () => {
    setPlacing(true)
    setError(null)
    try {
      await placeOrder()
      onPlaced()
    } catch (e) {
      setError((e as Error).message)
      setPlacing(false)
    }
  }, [onPlaced])

  return (
    <div className="screen menu-screen cart-screen">
      <CafeHeader onBack={onBack} onViewMenu={onViewMenu} />

      <div className="menu-head menu-head-row">
        <h1 className="menu-title">Your cart</h1>
        <button type="button" className="orders-link" onClick={onOpenOrders}>
          My orders ›
        </button>
      </div>

      {loading && <p className="muted center">Fetching your cart…</p>}
      {error && <p className="form-error center">{error}</p>}
      {!loading && !error && lines.length === 0 && (
        <p className="muted center">Your cart is empty.</p>
      )}

      {lines.length > 0 && (
        <>
          <OrderLines lines={lines} />

          <div className="cart-total-row">
            <span>Total</span>
            <span className="cart-total">{money(total)}</span>
          </div>

          <button
            type="button"
            className="candy-btn btn-mint cart-place"
            onClick={place}
            disabled={placing}
          >
            {placing ? 'Placing…' : `Place order · ${money(total)}`}
          </button>
        </>
      )}
    </div>
  )
}
