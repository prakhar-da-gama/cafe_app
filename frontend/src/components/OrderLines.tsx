import { money, signedMoney, type OrderLine } from '../api'

interface Props {
  lines: OrderLine[]
}

/** The expanded line items of an order (or cart): each with its dish, the
 *  chosen sizes and add-ons, quantity, and line subtotal. Shared by the cart
 *  and my-orders pages so they read identically. */
export default function OrderLines({ lines }: Props) {
  return (
    <div className="order-lines">
      {lines.map((line) => (
        <article key={line.id} className="order-line">
          <div className="order-line-top">
            <span
              className={line.item.is_veg ? 'veg-dot veg' : 'veg-dot nonveg'}
              aria-label={line.item.is_veg ? 'Vegetarian' : 'Non-vegetarian'}
            />
            <h3 className="order-line-name">{line.item.name}</h3>
            {line.quantity > 1 && (
              <span className="order-line-qty">×{line.quantity}</span>
            )}
          </div>

          {(line.variants.length > 0 || line.toppings.length > 0) && (
            <div className="opt-chips order-line-opts">
              {line.variants.map((v) => (
                <span key={`v${v.id}`} className="opt-chip">
                  {v.name}
                  <em>{signedMoney(v.price_delta)}</em>
                </span>
              ))}
              {line.toppings.map((t) => (
                <span key={`t${t.id}`} className="opt-chip opt-topping">
                  {t.name}
                  <em>{signedMoney(t.price)}</em>
                </span>
              ))}
            </div>
          )}

          <div className="order-line-foot">
            {line.quantity > 1 && (
              <span className="order-line-unit">{money(line.price)} each</span>
            )}
            <span className="order-line-price">
              {money(Number(line.price) * line.quantity)}
            </span>
          </div>
        </article>
      ))}
    </div>
  )
}
