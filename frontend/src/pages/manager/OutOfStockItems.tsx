import { useEffect, useState } from 'react'
import { getOutOfStockItems, money, setItemAvailability, type MenuItem } from '../../api'
import ManagerHeader from '../../components/ManagerHeader'

interface Props {
  onBack: () => void
}

/** Manager page: every item currently out of stock, each restockable in place. */
export default function OutOfStockItems({ onBack }: Props) {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    getOutOfStockItems()
      .then((res) => alive && setItems(res))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const restock = async (id: number) => {
    setBusyId(id)
    setError(null)
    try {
      await setItemAvailability(id, true)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="screen menu-screen mgr-screen">
      <ManagerHeader onBack={onBack} />

      <div className="menu-head">
        <h1 className="menu-title">Out-of-stock items</h1>
      </div>

      {loading && <p className="muted center">Loading…</p>}
      {error && <p className="form-error center">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="muted center">Nothing is out of stock. 🎉</p>
      )}

      <div className="oos-list">
        {items.map((item) => (
          <div key={item.id} className="oos-row">
            <div className="oos-info">
              <span
                className={item.is_veg ? 'veg-dot veg' : 'veg-dot nonveg'}
                aria-label={item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}
              />
              <span className="oos-name">{item.name}</span>
              <span className="oos-price">{money(item.price)}</span>
            </div>
            <button
              type="button"
              className="candy-btn btn-mint sm"
              onClick={() => restock(item.id)}
              disabled={busyId === item.id}
            >
              Restock
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
