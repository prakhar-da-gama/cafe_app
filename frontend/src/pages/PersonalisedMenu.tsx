import { useCallback } from 'react'
import { getPersonalisedMenu, type Tag } from '../api'
import CafeHeader from '../components/CafeHeader'
import MenuBrowser from '../components/MenuBrowser'

interface Props {
  selection: Tag[]
  onBack: () => void
  onViewMenu: () => void
  onOpenCart: () => void
  onOpenOrders: () => void
}

/** The personalised menu: the exact same category/subcategory/dish browser as
 *  the full menu, showing every dish — but the ones matching the flavours the
 *  user picked are flagged `is_recommended` and floated to the top of each
 *  subcategory as glowing "top picks". */
export default function PersonalisedMenu({
  selection,
  onBack,
  onViewMenu,
  onOpenCart,
  onOpenOrders,
}: Props) {
  const tagIds = selection.map((t) => t.id)
  const fetchKey = tagIds.join(',')
  const fetchMenu = useCallback(
    () => getPersonalisedMenu(tagIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchKey],
  )

  return (
    <MenuBrowser
      fetchMenu={fetchMenu}
      fetchKey={fetchKey}
      title="Picked for you"
      header={<CafeHeader onBack={onBack} onViewMenu={onViewMenu} />}
      onOpenCart={onOpenCart}
      onOpenOrders={onOpenOrders}
      emptyText="No drinks match those flavours yet."
      subhead={
        selection.length > 0 ? (
          <div className="chip-row">
            {selection.map((t, i) => (
              <span key={t.id} className="mini-chip" data-candy={(i % 8) + 1}>
                {t.tag}
              </span>
            ))}
          </div>
        ) : undefined
      }
    />
  )
}
