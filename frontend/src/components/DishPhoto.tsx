import { useState } from 'react'
import type { MenuItem } from '../api'

interface Props {
  item: MenuItem
  /** Palette index (1-8) used for the placeholder gradient. */
  candy: number
  className?: string
  /** Rendered letter size, in px. */
  size?: number
}

/** A dish image that gracefully falls back to a candy-gradient monogram when
 *  the item has no photo (or the photo fails to load). */
export default function DishPhoto({
  item,
  candy,
  className,
  size = 34,
}: Props) {
  const [broken, setBroken] = useState(false)
  const src = item.photos[0]
  const cls = className ? `dish-photo ${className}` : 'dish-photo'

  if (src && !broken) {
    return (
      <div className={cls} data-candy={candy}>
        <img src={src} alt={item.name} loading="lazy" onError={() => setBroken(true)} />
      </div>
    )
  }

  return (
    <div className={`${cls} dish-photo-ph`} data-candy={candy} aria-hidden="true">
      <span style={{ fontSize: size }}>{item.name.charAt(0).toUpperCase()}</span>
    </div>
  )
}
