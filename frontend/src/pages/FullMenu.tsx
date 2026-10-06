import { useEffect, useMemo, useState } from 'react'
import { getFullMenu, money, type MenuCategory, type MenuItem } from '../api'
import CafeHeader from '../components/CafeHeader'
import DishPhoto from '../components/DishPhoto'
import MenuItemSheet from '../components/MenuItemSheet'

interface Props {
  onBack: () => void
}

/** Keep only the live parts of the tree: active categories/subcategories that
 *  still have at least one active item to show. */
function prune(menu: MenuCategory[]): MenuCategory[] {
  return menu
    .filter((c) => c.is_active)
    .map((c) => ({
      ...c,
      subcategories: c.subcategories
        .filter((s) => s.is_active)
        .map((s) => ({ ...s, items: s.items.filter((i) => i.is_active) }))
        .filter((s) => s.items.length > 0),
    }))
    .filter((c) => c.subcategories.length > 0)
}

/** The full menu: browse by category, then subcategory; tap a dish for detail. */
export default function FullMenu({ onBack }: Props) {
  const [menu, setMenu] = useState<MenuCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCat, setActiveCat] = useState<number | null>(null)
  // The dish whose detail sheet is open, plus its palette index.
  const [active, setActive] = useState<{ item: MenuItem; candy: number } | null>(
    null,
  )

  useEffect(() => {
    let alive = true
    getFullMenu()
      .then((m) => {
        if (!alive) return
        const live = prune(m)
        setMenu(live)
        setActiveCat(live[0]?.id ?? null)
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const category = useMemo(
    () => menu.find((c) => c.id === activeCat) ?? null,
    [menu, activeCat],
  )

  return (
    <div className="screen full-menu">
      <CafeHeader menuActive onBack={onBack} />

      <div className="menu-head">
        <h1 className="menu-title">The full menu</h1>
      </div>

      {loading && <p className="muted center">Laying out the menu…</p>}
      {error && <p className="form-error center">{error}</p>}
      {!loading && !error && menu.length === 0 && (
        <p className="muted center">The menu is empty right now.</p>
      )}

      {menu.length > 0 && (
        <nav className="cat-nav" aria-label="Menu categories">
          {menu.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={c.id === activeCat ? 'cat-pill cat-on' : 'cat-pill'}
              data-candy={(i % 8) + 1}
              onClick={() => setActiveCat(c.id)}
              aria-pressed={c.id === activeCat}
            >
              {c.name}
            </button>
          ))}
        </nav>
      )}

      {category && (
        <div className="menu-scroll" key={category.id}>
          {category.subcategories.map((sub) => (
            <section key={sub.id} className="subcat">
              <div className="subcat-head">
                <h2 className="subcat-name">{sub.name}</h2>
                {sub.description && (
                  <p className="subcat-desc">{sub.description}</p>
                )}
              </div>

              <div className="dish-grid">
                {sub.items.map((item, i) => {
                  const candy = (i % 8) + 1
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={
                        item.is_available ? 'dish-card' : 'dish-card dish-out'
                      }
                      onClick={() => setActive({ item, candy })}
                    >
                      <DishPhoto item={item} candy={candy} />
                      <div className="dish-info">
                        <h3 className="dish-name">{item.name}</h3>
                        <div className="dish-meta">
                          <span
                            className={
                              item.is_veg ? 'veg-dot veg' : 'veg-dot nonveg'
                            }
                            aria-label={
                              item.is_veg ? 'Vegetarian' : 'Non-vegetarian'
                            }
                          />
                          <span className="dish-price">
                            {money(item.price)}
                          </span>
                        </div>
                      </div>
                      {!item.is_available && (
                        <span className="dish-out-tag">Sold out</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {active && (
        <MenuItemSheet
          item={active.item}
          candy={active.candy}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  )
}
