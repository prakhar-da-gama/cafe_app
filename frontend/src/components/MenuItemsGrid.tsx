import { useCallback, useEffect, useRef, useState } from 'react'
import { getMenuByTags, money, signedMoney, type MenuItem } from '../api'

interface Props {
  tagIds: number[]
  emptyText?: string
}

const PAGE_SIZE = 6

/** Paginated, infinite-scrolling grid of menu items for a set of tag ids
 *  (pass an empty array for the full menu). Shared by the personalised
 *  and full-menu pages. */
export default function MenuItemsGrid({
  tagIds,
  emptyText = 'No drinks here yet.',
}: Props) {
  const [items, setItems] = useState<MenuItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sentinel = useRef<HTMLDivElement | null>(null)
  // Guards the observer from firing overlapping loads.
  const loadingRef = useRef(false)

  // A stable key so the loader resets exactly when the filter changes.
  const filterKey = tagIds.join(',')

  const loadPage = useCallback(
    async (next: number) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      setError(null)
      try {
        const res = await getMenuByTags(tagIds, next, PAGE_SIZE)
        setItems((prev) => (next === 1 ? res.items : [...prev, ...res.items]))
        setPage(res.page)
        setHasMore(res.has_more)
        setTotal(res.total)
      } catch (err) {
        setError((err as Error).message)
        setHasMore(false)
      } finally {
        setLoading(false)
        loadingRef.current = false
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterKey],
  )

  // Reset and fetch the first page whenever the filter changes.
  useEffect(() => {
    setItems([])
    setPage(1)
    setHasMore(true)
    loadPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  // Infinite scroll: load the next page as the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          loadPage(page + 1)
        }
      },
      { rootMargin: '240px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [page, hasMore, loadPage])

  return (
    <>
      {total > 0 && <p className="menu-count">{total} drinks</p>}

      {error && <p className="form-error center">{error}</p>}

      <div className="menu-grid">
        {items.map((item) => (
          <article key={item.id} className="menu-card">
            <div className="menu-card-top">
              <span
                className={item.is_veg ? 'veg-dot veg' : 'veg-dot nonveg'}
                aria-label={item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}
              />
              <span className="menu-price">{money(item.price)}</span>
            </div>
            <h2 className="menu-name">{item.name}</h2>
            {item.description && <p className="menu-desc">{item.description}</p>}

            {item.variants.length > 0 && (
              <div className="opt-block">
                <span className="opt-label">Sizes</span>
                <div className="opt-chips">
                  {item.variants.map((v) => (
                    <span key={v.id} className="opt-chip">
                      {v.name}
                      <em>{signedMoney(v.price_delta)}</em>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {item.toppings.length > 0 && (
              <div className="opt-block">
                <span className="opt-label">Add-ons</span>
                <div className="opt-chips">
                  {item.toppings.map((t) => (
                    <span key={t.id} className="opt-chip opt-topping">
                      {t.name}
                      <em>{signedMoney(t.price)}</em>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      {loading && <p className="muted center">Brewing more…</p>}
      {!loading && !hasMore && items.length > 0 && (
        <p className="muted center end-note">That's the whole tray.</p>
      )}
      {!loading && items.length === 0 && !error && (
        <p className="muted center">{emptyText}</p>
      )}

      <div ref={sentinel} className="sentinel" aria-hidden="true" />
    </>
  )
}
