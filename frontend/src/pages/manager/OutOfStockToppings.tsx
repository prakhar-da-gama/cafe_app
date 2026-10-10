import { useEffect, useState } from 'react'
import {
  getOutOfStockToppings,
  setToppingAvailability,
  signedMoney,
  type OutOfStockToppingGroup,
} from '../../api'
import ManagerHeader from '../../components/ManagerHeader'

interface Props {
  onBack: () => void
}

/** Manager page: out-of-stock toppings, grouped under each item they belong to.
 *  A topping offered by several items shows under each; restocking it clears it
 *  from every group. */
export default function OutOfStockToppings({ onBack }: Props) {
  const [groups, setGroups] = useState<OutOfStockToppingGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    getOutOfStockToppings()
      .then((res) => alive && setGroups(res))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const restock = async (toppingId: number) => {
    setBusyId(toppingId)
    setError(null)
    try {
      await setToppingAvailability(toppingId, true)
      // The topping may sit under several items; drop it everywhere, then drop
      // any item group that's left empty.
      setGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            toppings: g.toppings.filter((t) => t.id !== toppingId),
          }))
          .filter((g) => g.toppings.length > 0),
      )
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
        <h1 className="menu-title">Out-of-stock add-ons</h1>
      </div>

      {loading && <p className="muted center">Loading…</p>}
      {error && <p className="form-error center">{error}</p>}
      {!loading && !error && groups.length === 0 && (
        <p className="muted center">No toppings are out of stock. 🎉</p>
      )}

      <div className="oos-groups">
        {groups.map((group) => (
          <section key={group.item.id} className="oos-group">
            <div className="oos-group-head">
              <span
                className={group.item.is_veg ? 'veg-dot veg' : 'veg-dot nonveg'}
                aria-label={group.item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}
              />
              <h2 className="oos-group-name">{group.item.name}</h2>
            </div>

            <div className="oos-list">
              {group.toppings.map((t) => (
                <div key={t.id} className="oos-row">
                  <div className="oos-info">
                    <span className="oos-name">{t.name}</span>
                    <span className="oos-price">{signedMoney(t.price)}</span>
                  </div>
                  <button
                    type="button"
                    className="candy-btn btn-mint sm"
                    onClick={() => restock(t.id)}
                    disabled={busyId === t.id}
                  >
                    Restock
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
