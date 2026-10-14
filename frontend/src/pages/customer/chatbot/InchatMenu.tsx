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
.im-name .im-qty { color: var(--ink-soft); font-weight: 700; }
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
  border: none;
  cursor: pointer;
  font-weight: 800;
  font-size: 0.8rem;
  padding: 8px 16px;
  border-radius: 999px;
  color: #fff;
  background: linear-gradient(135deg, var(--candy-1), var(--candy-6));
  box-shadow: 0 4px 10px color-mix(in srgb, var(--candy-6) 35%, transparent);
  transition: transform 0.1s, filter 0.15s;
}
.im-select:active:not(:disabled) { transform: scale(0.94); }
.im-select:disabled { opacity: 0.5; cursor: default; box-shadow: none; }
.im-select-added {
  background: color-mix(in srgb, var(--candy-4) 20%, #fff);
  color: #1b7a50;
}

.im-expand { padding: 0 15px 14px; display: flex; flex-direction: column; gap: 10px; }
.im-step-label {
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--ink-soft);
  letter-spacing: 0.02em;
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
.im-chip:hover { border-color: color-mix(in srgb, var(--candy-6) 50%, #fff); }
.im-chip-on {
  border-color: var(--candy-6);
  background: color-mix(in srgb, var(--candy-6) 12%, #fff);
}
.im-chip-oos { opacity: 0.45; cursor: not-allowed; }
.im-step-actions { display: flex; gap: 8px; margin-top: 2px; }
.im-btn {
  border: none;
  cursor: pointer;
  font-weight: 800;
  font-size: 0.82rem;
  padding: 9px 16px;
  border-radius: 999px;
  color: #fff;
  background: linear-gradient(135deg, #52e0b0, #14b98a);
  box-shadow: 0 4px 10px rgba(20,185,138,.32);
  transition: transform 0.1s, filter 0.15s;
}
.im-btn:active:not(:disabled) { transform: scale(0.96); }
.im-btn:disabled { opacity: 0.5; cursor: default; box-shadow: none; }
.im-btn-ghost {
  background: #fff;
  color: var(--ink-soft);
  border: 2px solid var(--line);
  box-shadow: none;
}

.im-confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 8px;
  border: none;
  cursor: pointer;
  font-weight: 800;
  font-size: 0.9rem;
  padding: 14px 16px;
  color: var(--ink);
  background: color-mix(in srgb, var(--candy-3) 22%, #fff);
  transition: filter 0.15s;
}
.im-confirm:hover:not(:disabled) { filter: brightness(0.98); }
.im-confirm:disabled { opacity: 0.6; cursor: default; }
.im-confirm-done { color: #1b7a50; background: color-mix(in srgb, var(--candy-4) 24%, #fff); }
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

type Stage = 'idle' | 'toppings' | 'variants' | 'confirm'

interface RowProps {
  item: ChatMenuItem
  onAdd: (toppingIds: number[], variantId: number | null) => Promise<void>
}

/** One item row: name + price + a Select button that walks the guest through
 *  toppings (multi-select) → variants (single-select) → Add to cart. Items with
 *  no toppings/variants go straight to the Add to cart step. */
function MenuRow({ item, onAdd }: RowProps) {
  const [stage, setStage] = useState<Stage>('idle')
  const [toppingIds, setToppingIds] = useState<number[]>([])
  const [variantId, setVariantId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasToppings = item.toppings.length > 0
  const hasVariants = item.variants.length > 0

  // Where "Select" lands first: toppings, then variants, else straight to add.
  function startStage(): Stage {
    if (hasToppings) return 'toppings'
    if (hasVariants) return 'variants'
    return 'confirm'
  }

  function toggleTopping(id: number) {
    setToppingIds((ids) =>
      ids.includes(id) ? ids.filter((t) => t !== id) : [...ids, id],
    )
  }

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await onAdd(toppingIds, variantId)
      setAdded(true)
      setStage('idle')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
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
            {item.quantity > 1 && <span className="im-qty"> ×{item.quantity}</span>}
          </div>
          <div className="im-price">{money(item.price)}</div>
        </div>
        <button
          type="button"
          className={added ? 'im-select im-select-added' : 'im-select'}
          onClick={() => setStage(stage === 'idle' ? startStage() : 'idle')}
          disabled={!item.is_available && !added}
        >
          {added ? 'Added ✓' : stage === 'idle' ? 'Select' : 'Close'}
        </button>
      </div>

      {stage === 'toppings' && (
        <div className="im-expand">
          <span className="im-step-label">Add toppings (optional)</span>
          <div className="im-chips">
            {item.toppings.map((t) => {
              const on = toppingIds.includes(t.id)
              const oos = !t.is_available
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`im-chip${on ? ' im-chip-on' : ''}${oos ? ' im-chip-oos' : ''}`}
                  onClick={() => !oos && toggleTopping(t.id)}
                  disabled={oos}
                  aria-pressed={on}
                >
                  {t.name} {Number(t.price) > 0 ? signedMoney(t.price) : ''}
                </button>
              )
            })}
          </div>
          <div className="im-step-actions">
            <button
              type="button"
              className="im-btn"
              onClick={() => setStage(hasVariants ? 'variants' : 'confirm')}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {stage === 'variants' && (
        <div className="im-expand">
          <span className="im-step-label">Choose a size / variant</span>
          <div className="im-chips">
            {item.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                className={variantId === v.id ? 'im-chip im-chip-on' : 'im-chip'}
                onClick={() => setVariantId(v.id)}
                aria-pressed={variantId === v.id}
              >
                {v.name} {Number(v.price_delta) !== 0 ? signedMoney(v.price_delta) : ''}
              </button>
            ))}
          </div>
          <div className="im-step-actions">
            {hasToppings && (
              <button
                type="button"
                className="im-btn im-btn-ghost"
                onClick={() => setStage('toppings')}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="im-btn"
              onClick={add}
              disabled={busy || variantId === null}
            >
              {busy ? 'Adding…' : 'Add to cart'}
            </button>
          </div>
        </div>
      )}

      {stage === 'confirm' && (
        <div className="im-expand">
          <div className="im-step-actions">
            <button type="button" className="im-btn" onClick={add} disabled={busy}>
              {busy ? 'Adding…' : 'Add to cart'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="im-err">{error}</p>}
    </div>
  )
}

/** The barista's suggested items as a small in-chat table (up to four rows,
 *  each with its own topping/variant selection), plus a final row that adds
 *  every suggested item to the cart as-is. */
export default function InchatMenu({ items }: Props) {
  const rows = flattenItems(items)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (rows.length === 0) return null

  // The fifth row: add every suggested item with its requested quantity, taking
  // the payload straight from items_json (no custom toppings/variants).
  async function confirmAll() {
    setConfirming(true)
    setError(null)
    try {
      for (const item of rows) {
        await addItemToCart(item.id, [], null, item.quantity)
      }
      setConfirmed(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setConfirming(false)
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
          onAdd={(toppingIds, variantId) =>
            addItemToCart(item.id, toppingIds, variantId, item.quantity).then(
              () => undefined,
            )
          }
        />
      ))}
      {error && <p className="im-err">{error}</p>}
      <button
        type="button"
        className={confirmed ? 'im-confirm im-confirm-done' : 'im-confirm'}
        onClick={confirmAll}
        disabled={confirming || confirmed}
      >
        {confirmed
          ? 'Added to cart ✓'
          : confirming
            ? 'Adding items…'
            : 'Confirm above items and add to cart'}
      </button>
    </div>
  )
}
