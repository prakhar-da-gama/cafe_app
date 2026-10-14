import { useState } from 'react'
import {
  addItemToCart,
  money,
  signedMoney,
  type ChatItems,
  type ChatMenuItem,
} from '../../../api'

interface Props {
  // The barista's resolved suggestions for this turn.
  items: ChatItems
}

// Per-row choices the guest makes before confirming: whether the item is
// selected, its toppings/variant, and how many.
interface Selection {
  selected: boolean
  toppingIds: number[]
  variantId: number | null
  quantity: number
}

// Self-contained styles so the whole table — markup, logic and motion — lives
// in this one file, in the app's candy palette. Rendered inline in the chat so
// it reads as if the barista answered with a small menu (never a popup).
const IM_CSS = `
.im-root {
  align-self: flex-start;
  max-width: 94%;
  width: 100%;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: var(--radius);
  border-bottom-left-radius: 6px;
  box-shadow: 0 6px 14px rgba(58,43,74,.08);
  overflow: hidden;
  animation: im-in 0.3s ease both;
}
@keyframes im-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.im-head {
  padding: 11px 15px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-soft);
  background: color-mix(in srgb, var(--candy-6) 7%, #fff);
  border-bottom: 1.5px solid var(--line);
}
.im-row { border-bottom: 1.5px solid var(--line); }
.im-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 15px;
}
.im-row-info { flex: 1; min-width: 0; }
.im-name {
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--ink);
  line-height: 1.25;
}
.im-name .im-qty-sug { color: var(--ink-soft); font-weight: 700; }
.im-price { font-size: 0.82rem; color: var(--candy-6); font-weight: 700; }
.im-veg {
  width: 13px; height: 13px; flex-shrink: 0;
  border: 1.6px solid currentColor;
  border-radius: 3px;
  display: grid; place-items: center;
}
.im-veg::after {
  content: ''; width: 6px; height: 6px; border-radius: 50%;
  background: currentColor;
}
.im-veg-y { color: #2e9e5b; }
.im-veg-n { color: #d6453c; }

.im-select {
  flex-shrink: 0;
  border: 2px solid var(--line);
  cursor: pointer;
  font-weight: 800;
  font-size: 0.8rem;
  padding: 7px 15px;
  border-radius: 999px;
  color: var(--ink);
  background: #fff;
  transition: transform 0.1s, border-color 0.12s, background 0.12s, color 0.12s;
}
.im-select:active:not(:disabled) { transform: scale(0.94); }
.im-select:disabled { opacity: 0.5; cursor: default; }
.im-select-on {
  border-color: var(--candy-6);
  background: linear-gradient(135deg, var(--candy-1), var(--candy-6));
  color: #fff;
}

.im-expand { padding: 0 15px 14px; display: flex; flex-direction: column; gap: 12px; }
.im-step-label {
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--ink-soft);
  letter-spacing: 0.02em;
  margin-bottom: 6px;
  display: block;
}
.im-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.im-chip {
  border: 2px solid var(--line);
  background: #fff;
  color: var(--ink);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.82rem;
  padding: 7px 13px;
  border-radius: 999px;
  transition: border-color 0.12s, background 0.12s;
}
.im-chip:hover:not(:disabled) { border-color: color-mix(in srgb, var(--candy-6) 50%, #fff); }
.im-chip-on {
  border-color: var(--candy-6);
  background: color-mix(in srgb, var(--candy-6) 12%, #fff);
}
.im-chip:disabled { cursor: not-allowed; }
.im-chip-oos { opacity: 0.45; }

/* Quantity stepper */
.im-qty { display: flex; align-items: center; gap: 12px; }
.im-stepper {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 2px solid var(--line);
  border-radius: 999px;
  padding: 2px;
}
.im-step-btn {
  width: 30px; height: 30px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--candy-6) 10%, #fff);
  color: var(--candy-6);
  font-size: 1.1rem;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  display: grid; place-items: center;
  transition: transform 0.1s, filter 0.12s;
}
.im-step-btn:hover:not(:disabled) { filter: brightness(0.97); }
.im-step-btn:active:not(:disabled) { transform: scale(0.9); }
.im-step-btn:disabled { opacity: 0.4; cursor: default; }
.im-step-val {
  min-width: 24px;
  text-align: center;
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--ink);
}

/* Footer: the single red Confirm button at the right of the last row. */
.im-foot {
  display: flex;
  justify-content: flex-end;
  padding: 12px 15px;
}
.im-err { padding: 0 15px 12px; color: var(--danger); font-size: 0.82rem; font-weight: 700; }
`

// Flatten the (already pruned) suggestion tree to the flat list of items the
// table shows, capped at four rows.
function flattenItems(items: ChatItems): ChatMenuItem[] {
  const flat: ChatMenuItem[] = []
  for (const category of items.categories) {
    for (const subcategory of category.subcategories) {
      for (const item of subcategory.items) flat.push(item)
    }
  }
  return flat.slice(0, 4)
}

interface RowProps {
  item: ChatMenuItem
  sel: Selection
  onChange: (next: Selection) => void
  // Locked once the items have been added to the cart.
  locked: boolean
}

/** One item row: name + price + a Select toggle. Selecting it reveals the
 *  item's toppings (multi-select), variants (single-select) and a quantity
 *  stepper — the choices confirmed together by the footer button. */
function MenuRow({ item, sel, onChange, locked }: RowProps) {
  const hasToppings = item.toppings.length > 0
  const hasVariants = item.variants.length > 0

  function toggleSelected() {
    const selected = !sel.selected
    // Preselect the first variant when an item with variants is picked, so a
    // variant-bearing item never gets added without one.
    const variantId =
      selected && hasVariants && sel.variantId === null
        ? item.variants[0].id
        : sel.variantId
    onChange({ ...sel, selected, variantId })
  }

  function toggleTopping(id: number) {
    const on = sel.toppingIds.includes(id)
    onChange({
      ...sel,
      toppingIds: on
        ? sel.toppingIds.filter((t) => t !== id)
        : [...sel.toppingIds, id],
    })
  }

  return (
    <div className="im-row">
      <div className="im-row-main">
        <span
          className={item.is_veg ? 'im-veg im-veg-y' : 'im-veg im-veg-n'}
          aria-label={item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}
        />
        <div className="im-row-info">
          <div className="im-name">
            {item.name}
            {item.quantity > 1 && (
              <span className="im-qty-sug"> (×{item.quantity} suggested)</span>
            )}
          </div>
          <div className="im-price">{money(item.price)}</div>
        </div>
        <button
          type="button"
          className={sel.selected ? 'im-select im-select-on' : 'im-select'}
          onClick={toggleSelected}
          disabled={locked || (!item.is_available && !sel.selected)}
          aria-pressed={sel.selected}
        >
          {sel.selected ? 'Selected ✓' : 'Select'}
        </button>
      </div>

      {sel.selected && (
        <div className="im-expand">
          {hasToppings && (
            <div>
              <span className="im-step-label">Add toppings (optional)</span>
              <div className="im-chips">
                {item.toppings.map((t) => {
                  const on = sel.toppingIds.includes(t.id)
                  const oos = !t.is_available
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`im-chip${on ? ' im-chip-on' : ''}${oos ? ' im-chip-oos' : ''}`}
                      onClick={() => toggleTopping(t.id)}
                      disabled={locked || oos}
                      aria-pressed={on}
                    >
                      {t.name} {Number(t.price) > 0 ? signedMoney(t.price) : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {hasVariants && (
            <div>
              <span className="im-step-label">Choose a size / variant</span>
              <div className="im-chips">
                {item.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={sel.variantId === v.id ? 'im-chip im-chip-on' : 'im-chip'}
                    onClick={() => onChange({ ...sel, variantId: v.id })}
                    disabled={locked}
                    aria-pressed={sel.variantId === v.id}
                  >
                    {v.name}{' '}
                    {Number(v.price_delta) !== 0 ? signedMoney(v.price_delta) : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="im-qty">
            <span className="im-step-label" style={{ margin: 0 }}>
              Quantity
            </span>
            <div className="im-stepper">
              <button
                type="button"
                className="im-step-btn"
                onClick={() => onChange({ ...sel, quantity: Math.max(1, sel.quantity - 1) })}
                disabled={locked || sel.quantity <= 1}
                aria-label="Fewer"
              >
                −
              </button>
              <span className="im-step-val" aria-live="polite">
                {sel.quantity}
              </span>
              <button
                type="button"
                className="im-step-btn"
                onClick={() => onChange({ ...sel, quantity: sel.quantity + 1 })}
                disabled={locked}
                aria-label="More"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** The barista's suggested items as a small in-chat table (up to four rows).
 *  The guest selects the items they want (with toppings, variant and quantity)
 *  and the single Confirm button adds every selected item to the cart. */
export default function InchatMenu({ items }: Props) {
  const rows = flattenItems(items)
  const [selections, setSelections] = useState<Selection[]>(() =>
    rows.map((item) => ({
      selected: false,
      toppingIds: [],
      variantId: null,
      quantity: Math.max(1, item.quantity || 1),
    })),
  )
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (rows.length === 0) return null

  const anySelected = selections.some((s) => s.selected)

  function update(i: number, next: Selection) {
    setSelections((prev) => prev.map((s, idx) => (idx === i ? next : s)))
  }

  // Add every selected item to the cart with its chosen toppings, variant and
  // quantity (the payload drawn from items_json + the guest's choices).
  async function confirm() {
    if (!anySelected) return
    setSubmitting(true)
    setError(null)
    try {
      for (let i = 0; i < rows.length; i++) {
        const sel = selections[i]
        if (!sel.selected) continue
        await addItemToCart(rows[i].id, sel.toppingIds, sel.variantId, sel.quantity)
      }
      setDone(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="im-root">
      <style>{IM_CSS}</style>
      <div className="im-head">Suggested for you</div>
      {rows.map((item, i) => (
        <MenuRow
          key={`${item.id}-${i}`}
          item={item}
          sel={selections[i]}
          onChange={(next) => update(i, next)}
          locked={done}
        />
      ))}
      {error && <p className="im-err">{error}</p>}
      <div className="im-foot">
        <button
          type="button"
          className="end-chat-btn"
          onClick={confirm}
          disabled={!anySelected || submitting || done}
        >
          {done ? 'Added to cart ✓' : submitting ? 'Adding…' : 'Confirm items'}
        </button>
      </div>
    </div>
  )
}
