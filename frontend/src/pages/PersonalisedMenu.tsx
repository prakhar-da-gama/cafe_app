import { type Tag } from '../api'
import CafeHeader from '../components/CafeHeader'
import MenuItemsGrid from '../components/MenuItemsGrid'

interface Props {
  selection: Tag[]
  onBack: () => void
  onViewMenu: () => void
}

export default function PersonalisedMenu({
  selection,
  onBack,
  onViewMenu,
}: Props) {
  return (
    <div className="screen menu-screen">
      <CafeHeader onViewMenu={onViewMenu} />

      <div className="menu-head">
        <button type="button" className="back-link" onClick={onBack}>
          ‹ Back to flavours
        </button>
        <h1 className="menu-title">Picked for you</h1>
        {selection.length > 0 && (
          <div className="chip-row">
            {selection.map((t, i) => (
              <span key={t.id} className="mini-chip" data-candy={(i % 8) + 1}>
                {t.tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <MenuItemsGrid
        tagIds={selection.map((t) => t.id)}
        emptyText="No drinks match those flavours yet."
      />
    </div>
  )
}
