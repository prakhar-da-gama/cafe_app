import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  addItemToCart,
  money,
  setItemAvailability,
  setToppingAvailability,
  type FullMenuResponse,
  type MenuCategory,
  type MenuItem,
} from '../api'
import ConfirmDialog from './ConfirmDialog'
import DishPhoto from './DishPhoto'
import MenuItemSheet from './MenuItemSheet'

interface Props {
  /** Loads the nested menu (optionally tag-filtered). */
  fetchMenu: () => Promise<FullMenuResponse>
  /** Changes whenever the filter changes, so the menu refetches. */
  fetchKey: string
  /** The page title shown next to the cart badge. */
  title: string
  /** The shared <CafeHeader> for this page. */
  header: ReactNode
  /** Optional block rendered under the title row (e.g. selected-flavour chips). */
  subhead?: ReactNode
  /** Shown when the (possibly filtered) menu comes back empty. */
  emptyText?: string
  /** Opens the cart page (cart glyph). Omitted in manager mode. */
  onOpenCart?: () => void
  /** Opens the orders page (the "My orders" button). Omitted in manager mode. */
  onOpenOrders?: () => void
  /** Manager mode: swap add-to-cart for stock controls instead of ordering. */
  managerMode?: boolean
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

/** Browse a nested menu by category, then subcategory; tap a dish for detail.
 *  Shared by the full and personalised menu pages — they differ only in which
 *  items `fetchMenu` returns and the header/subhead chrome around the grid. */
export default function MenuBrowser({
  fetchMenu,
  fetchKey,
  title,
  header,
  subhead,
  emptyText = 'The menu is empty right now.',
  onOpenCart,
  onOpenOrders,
  managerMode = false,
}: Props) {
  const [menu, setMenu] = useState<MenuCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCat, setActiveCat] = useState<number | null>(null)
  const [cartCount, setCartCount] = useState(0)
  // The dish whose detail sheet is open, plus its palette index.
  const [active, setActive] = useState<{ item: MenuItem; candy: number } | null>(
    null,
  )
  // Pending confirm/warning popup (manager out-of-stock actions).
  const [confirm, setConfirm] = useState<{
    title: string
    message: string
    run: () => Promise<void>
  } | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  // Scroll-spy plumbing: the list renders every category stacked, and the
  // active pill follows whichever category has scrolled to the top — so
  // scrolling past one category advances the pills to the next.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const navRef = useRef<HTMLDivElement | null>(null)
  const catRefs = useRef(new Map<number, HTMLElement>())
  const pillRefs = useRef(new Map<number, HTMLButtonElement>())
  // While a pill-tap smooth-scroll is animating, pause the spy so it doesn't
  // flicker through the categories it passes on the way.
  const programmaticUntil = useRef(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetchMenu()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey])

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

  // ---- Manager stock controls ----

  // Patch one item (and the open sheet, if it's that item) inside the live tree.
  const patchItem = (itemId: number, patch: Partial<MenuItem>) => {
    const apply = (it: MenuItem) => (it.id === itemId ? { ...it, ...patch } : it)
    setMenu((prev) =>
      prev.map((c) => ({
        ...c,
        subcategories: c.subcategories.map((s) => ({
          ...s,
          items: s.items.map(apply),
        })),
      })),
    )
    setActive((a) =>
      a && a.item.id === itemId ? { ...a, item: apply(a.item) } : a,
    )
  }

  // Patch one topping's availability within an item (and the open sheet).
  const patchTopping = (
    itemId: number,
    toppingId: number,
    isAvailable: boolean,
  ) => {
    const apply = (it: MenuItem) =>
      it.id === itemId
        ? {
            ...it,
            toppings: it.toppings.map((t) =>
              t.id === toppingId ? { ...t, is_available: isAvailable } : t,
            ),
          }
        : it
    setMenu((prev) =>
      prev.map((c) => ({
        ...c,
        subcategories: c.subcategories.map((s) => ({
          ...s,
          items: s.items.map(apply),
        })),
      })),
    )
    setActive((a) =>
      a && a.item.id === itemId ? { ...a, item: apply(a.item) } : a,
    )
  }

  const changeItemAvailability = async (itemId: number, isAvailable: boolean) => {
    await setItemAvailability(itemId, isAvailable)
    patchItem(itemId, { is_available: isAvailable })
  }

  const changeToppingAvailability = async (
    itemId: number,
    toppingId: number,
    isAvailable: boolean,
  ) => {
    await setToppingAvailability(toppingId, isAvailable)
    patchTopping(itemId, toppingId, isAvailable)
  }

  // Marking out of stock needs a warning + confirm; restocking is immediate.
  const askItemOutOfStock = (item: MenuItem) =>
    setConfirm({
      title: 'Mark out of stock?',
      message: `"${item.name}" will stop being orderable by customers until you restock it.`,
      run: () => changeItemAvailability(item.id, false),
    })

  const restockItem = async (itemId: number) => {
    try {
      await changeItemAvailability(itemId, true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const runConfirm = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    setError(null)
    try {
      await confirm.run()
      setConfirm(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setConfirmBusy(false)
    }
  }

  // As the list scrolls, mark the category whose top has reached the viewport
  // top as active (and the last one once scrolled to the very bottom, so short
  // trailing categories still get selected).
  useEffect(() => {
    const el = scrollRef.current
    if (!el || menu.length === 0) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (Date.now() < programmaticUntil.current) return
        const containerTop = el.getBoundingClientRect().top
        const atBottom =
          el.scrollTop + el.clientHeight >= el.scrollHeight - 2
        let current = menu[0].id
        for (const c of menu) {
          const sec = catRefs.current.get(c.id)
          if (sec && sec.getBoundingClientRect().top - containerTop <= 24) {
            current = c.id
          }
        }
        if (atBottom) current = menu[menu.length - 1].id
        setActiveCat((prev) => (prev === current ? prev : current))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [menu])

  // Keep the active pill scrolled into view in the horizontal nav.
  useEffect(() => {
    if (activeCat == null) return
    const nav = navRef.current
    const pill = pillRefs.current.get(activeCat)
    if (!nav || !pill) return
    const navRect = nav.getBoundingClientRect()
    const pillRect = pill.getBoundingClientRect()
    const target =
      nav.scrollLeft +
      (pillRect.left - navRect.left) -
      (nav.clientWidth - pill.clientWidth) / 2
    nav.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [activeCat])

  // Tapping a pill jumps the list to that category.
  const goToCategory = (id: number) => {
    const el = scrollRef.current
    const sec = catRefs.current.get(id)
    if (!el || !sec) return
    setActiveCat(id)
    programmaticUntil.current = Date.now() + 700
    const top =
      sec.getBoundingClientRect().top - el.getBoundingClientRect().top +
      el.scrollTop
    el.scrollTo({ top: Math.max(0, top - 4), behavior: 'smooth' })
  }

  return (
    <div className="screen full-menu">
      {header}

      <div className="menu-head menu-head-row">
        <h1 className="menu-title">{title}</h1>
        {!managerMode && (
          <div className="menu-actions">
            <button type="button" className="orders-link" onClick={onOpenOrders}>
              My orders
            </button>
            <button
              type="button"
              className="cart-badge cart-btn"
              onClick={onOpenCart}
              aria-label={`Cart: ${cartCount} items`}
            >
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
            </button>
          </div>
        )}
      </div>

      {subhead}

      {loading && <p className="muted center">Laying out the menu…</p>}
      {error && <p className="form-error center">{error}</p>}
      {!loading && !error && menu.length === 0 && (
        <p className="muted center">{emptyText}</p>
      )}

      {menu.length > 0 && (
        <nav className="cat-nav" aria-label="Menu categories" ref={navRef}>
          {menu.map((c, i) => (
            <button
              key={c.id}
              type="button"
              ref={(el) => {
                if (el) pillRefs.current.set(c.id, el)
                else pillRefs.current.delete(c.id)
              }}
              className={c.id === activeCat ? 'cat-pill cat-on' : 'cat-pill'}
              data-candy={(i % 8) + 1}
              onClick={() => goToCategory(c.id)}
              aria-pressed={c.id === activeCat}
            >
              {c.name}
            </button>
          ))}
        </nav>
      )}

      {menu.length > 0 && (
        <div className="menu-scroll" ref={scrollRef}>
          {menu.map((c, ci) => (
            <section
              key={c.id}
              className="cat-section"
              ref={(el) => {
                if (el) catRefs.current.set(c.id, el)
                else catRefs.current.delete(c.id)
              }}
            >
              <h2 className="cat-section-title" data-candy={(ci % 8) + 1}>
                {c.name}
              </h2>
              {c.subcategories.map((sub) => (
            <section key={sub.id} className="subcat">
              <div className="subcat-head">
                <h3 className="subcat-name">{sub.name}</h3>
                {sub.description && (
                  <p className="subcat-desc">{sub.description}</p>
                )}
              </div>

              <div className="dish-grid">
                {sub.items.map((item, i) => {
                  const candy = (i % 8) + 1
                  const cardClass =
                    'dish-card' +
                    (item.is_available ? '' : ' dish-out') +
                    (item.is_recommended ? ' dish-rec' : '')
                  return (
                    <div key={item.id} className={cardClass} data-candy={candy}>
                      {item.is_recommended && (
                        <span className="dish-rec-tag">Top picks</span>
                      )}
                      <button
                        type="button"
                        className="dish-open"
                        onClick={() => setActive({ item, candy })}
                      >
                        <DishPhoto item={item} candy={candy} />
                        <div className="dish-info">
                          <h4 className="dish-name">{item.name}</h4>
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
                      {!item.is_available && (
                        <span className="dish-out-tag">Sold out</span>
                      )}
                      {managerMode ? (
                        <button
                          type="button"
                          className={
                            item.is_available
                              ? 'dish-add dish-oos'
                              : 'dish-add dish-restock'
                          }
                          onClick={() =>
                            item.is_available
                              ? askItemOutOfStock(item)
                              : restockItem(item.id)
                          }
                        >
                          {item.is_available ? 'Mark out of stock' : 'Restock'}
                        </button>
                      ) : (
                        item.is_available && (
                          <button
                            type="button"
                            className="dish-add"
                            aria-label={`Add ${item.name} to cart`}
                            onClick={() => quickAdd(item, candy)}
                          >
                            Cart
                          </button>
                        )
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
              ))}
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
          managerMode={managerMode}
          onSetItemAvailability={(isAvailable) =>
            changeItemAvailability(active.item.id, isAvailable)
          }
          onSetToppingAvailability={(toppingId, isAvailable) =>
            changeToppingAvailability(active.item.id, toppingId, isAvailable)
          }
          onRequestConfirm={(opts) => setConfirm(opts)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Mark out of stock"
          danger
          busy={confirmBusy}
          onConfirm={runConfirm}
          onCancel={() => !confirmBusy && setConfirm(null)}
        />
      )}
    </div>
  )
}
