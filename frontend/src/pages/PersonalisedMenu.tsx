import { useCallback } from 'react'
import { getFullMenu, type Tag } from '../api'
import CafeHeader from '../components/CafeHeader'
import MenuBrowser from '../components/MenuBrowser'

interface Props {
  selection: Tag[]
  onBack: () => void
  onViewMenu: () => void
}

/** The personalised menu: the exact same category/subcategory/dish browser as
 *  the full menu, just filtered to the flavours the user picked. */
export default function PersonalisedMenu({
  selection,
  onBack,
  onViewMenu,
}: Props) {
  const tagIds = selection.map((t) => t.id)
  const fetchKey = tagIds.join(',')
  const fetchMenu = useCallback(
    () => getFullMenu(tagIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchKey],
  )

  return (
    <MenuBrowser
      fetchMenu={fetchMenu}
      fetchKey={fetchKey}
      title="Picked for you"
      header={<CafeHeader onBack={onBack} onViewMenu={onViewMenu} />}
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
