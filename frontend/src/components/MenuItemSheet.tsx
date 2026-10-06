import { useEffect, useMemo, useState } from 'react'
import { addItemToCart, money, signedMoney, type MenuItem } from '../api'
import DishPhoto from './DishPhoto'

interface Props {
  item: MenuItem
  /** Palette index (1-8) so the sheet echoes the card it opened from. */
  candy: number
  onClose: () => void
  /** Called after a line item is successfully added to the cart. */
  onAdded?: () => void
}

/** A bottom sheet with the full detail of one dish: large photo, description,
 *  sizes (variants) and add-ons (toppings). */
export default function MenuItemSheet({ item, candy, onClose, onAdded }: Props) {
  // Which size (variant) is picked, and which add-ons are toggled on. The
  // displayed price reflects the base price plus whatever is selected.
  const [variantId, setVariantId] = useState<number | null>(null)
  const [toppingIds, setToppingIds] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // A random candy colour for the add-to-cart button, fresh each time a dish opens.
  const btnColor = useMemo(() => {
    const variants = ['btn-sky', 'btn-grape', 'btn-mint', 'btn-sun']
    return variants[Math.floor(Math.random() * variants.length)]
  }, [item.id])

  const addToCart = async () => {
    // A variant must be chosen when the item offers sizes; toppings are optional.
    if (item.variants.length > 0 && variantId === null) {
      setError('Please pick a size first.')
      return
    }
    setError(null)
    setAdding(true)
    try {
      await addItemToCart(item.id, [...toppingIds], variantId)
      onAdded?.()
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setAdding(false)
    }
  }

  const toggleTopping = (id: number) =>
    setToppingIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const total = useMemo(() => {
    let sum = Number(item.price)
    const variant = item.variants.find((v) => v.id === variantId)
    if (variant) sum += Number(variant.price_delta)
    for (const t of item.toppings) {
      if (toppingIds.has(t.id)) sum += Number(t.price)
    }
    return sum
  }, [item, variantId, toppingIds])

  // Close on Escape and lock the page scroll while the sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="sheet-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <DishPhoto
          item={item}
          candy={candy}
          className="sheet-photo"
          size={96}
        />

        <div className="sheet-body">
          <div className="sheet-head">
            <span
              className={item.is_veg ? 'veg-dot veg' : 'veg-dot nonveg'}
              aria-label={item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}
            />
            <h2 className="sheet-name">{item.name}</h2>
          </div>

          <div className="sheet-price-row">
            <span className="sheet-price">{money(total)}</span>
            {!item.is_available && (
              <span className="sold-pill">Sold out</span>
            )}
          </div>

          {item.description && (
            <p className="sheet-desc">{item.description}</p>
          )}

          {item.variants.length > 0 && (
            <div className="opt-block">
              <span className="opt-label">Sizes</span>
              <div className="opt-chips">
                {item.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={
                      'opt-chip' + (v.id === variantId ? ' is-selected' : '')
                    }
                    aria-pressed={v.id === variantId}
                    onClick={() =>
                      setVariantId((cur) => (cur === v.id ? null : v.id))
                    }
                  >
                    {v.name}
                    <em>{signedMoney(v.price_delta)}</em>
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.toppings.length > 0 && (
            <div className="opt-block">
              <span className="opt-label">Add-ons</span>
              <div className="opt-chips">
                {item.toppings.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={
                      'opt-chip opt-topping' +
                      (toppingIds.has(t.id) ? ' is-selected' : '')
                    }
                    aria-pressed={toppingIds.has(t.id)}
                    onClick={() => toggleTopping(t.id)}
                  >
                    {t.name}
                    <em>{signedMoney(t.price)}</em>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="form-error sheet-error">{error}</p>}

          <button
            type="button"
            className={`candy-btn ${btnColor} sheet-add`}
            onClick={addToCart}
            disabled={adding || !item.is_available}
          >
            {item.is_available
              ? `Add to cart · ${money(total)}`
              : 'Sold out'}
          </button>
        </div>
      </div>
    </div>
  )
}
