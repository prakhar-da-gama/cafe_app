import { useEffect, useMemo, useState } from 'react'
import {
  addItemToCart,
  getFullMenu,
  money,
  type MenuCategory,
  type MenuItem,
} from '../api'
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
  const [cartCount, setCartCount] = useState(0)
  // The dish whose detail sheet is open, plus its palette index.
  const [active, setActive] = useState<{ item: MenuItem; candy: number } | null>(
    null,
  )

  useEffect(() => {
    let alive = true
    getFullMenu()
      .then((res) => {
        if (!alive) return
        const live = prune(res.categories)
        setMenu(live)
        setActiveCat(live[0]?.id ?? null)
        setCartCount(res.cart_count)
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // Add-to-cart from a dish card: items with no choices go straight to the
  // cart; anything with sizes or add-ons opens the sheet to pick them first.
  const quickAdd = async (item: MenuItem, candy: number) => {
    if (item.variants.length > 0 || item.toppings.length > 0) {
      setActive({ item, candy })
      return
    }
    try {
      await addItemToCart(item.id)
      setCartCount((c) => c + 1)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const category = useMemo(
    () => menu.find((c) => c.id === activeCat) ?? null,
    [menu, activeCat],
  )

  // A random candy colour (1-8) per item for its add-to-cart button. Picked once
  // when the menu loads so it stays put across re-renders, but is fresh each visit.
  const addCandy = useMemo(() => {
    const m: Record<number, number> = {}
    for (const c of menu)
      for (const s of c.subcategories)
        for (const it of s.items) m[it.id] = Math.floor(Math.random() * 8) + 1
    return m
  }, [menu])

  return (
    <div className="screen full-menu">
      <CafeHeader menuActive onBack={onBack} />

      <div className="menu-head menu-head-row">
        <h1 className="menu-title">The full menu</h1>
        <div className="cart-badge" aria-label={`Cart: ${cartCount} items`}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path
              d="M3 4h2l2.4 12.2a1.6 1.6 0 0 0 1.57 1.3h8.1a1.6 1.6 0 0 0 1.57-1.26L21.5 8H6"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="9.5" cy="20.5" r="1.4" fill="currentColor" />
            <circle cx="17.5" cy="20.5" r="1.4" fill="currentColor" />
          </svg>
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </div>
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
                    <div
                      key={item.id}
                      className={
                        item.is_available ? 'dish-card' : 'dish-card dish-out'
                      }
                    >
                      <button
                        type="button"
                        className="dish-open"
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
                      </button>
                      {item.is_available && (
                        <button
                          type="button"
                          className="dish-add"
                          data-candy={addCandy[item.id]}
                          aria-label={`Add ${item.name} to cart`}
                          onClick={() => quickAdd(item, candy)}
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                            <path
                              d="M12 5v14M5 12h14"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      )}
                      {!item.is_available && (
                        <span className="dish-out-tag">Sold out</span>
                      )}
                    </div>
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
          onAdded={() => setCartCount((c) => c + 1)}
        />
      )}
    </div>
  )
}
