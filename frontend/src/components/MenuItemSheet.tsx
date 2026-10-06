import { useEffect } from 'react'
import { money, signedMoney, type MenuItem } from '../api'
import DishPhoto from './DishPhoto'

interface Props {
  item: MenuItem
  /** Palette index (1-8) so the sheet echoes the card it opened from. */
  candy: number
  onClose: () => void
}

/** A bottom sheet with the full detail of one dish: large photo, description,
 *  sizes (variants) and add-ons (toppings). */
export default function MenuItemSheet({ item, candy, onClose }: Props) {
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
            <span className="sheet-price">{money(item.price)}</span>
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
        </div>
      </div>
    </div>
  )
}
