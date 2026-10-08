import { useCallback } from 'react'
import { getFullMenu } from '../api'
import CafeHeader from '../components/CafeHeader'
import MenuBrowser from '../components/MenuBrowser'

interface Props {
  onBack: () => void
}

/** The full menu: browse by category, then subcategory; tap a dish for detail. */
export default function FullMenu({ onBack }: Props) {
  const fetchMenu = useCallback(() => getFullMenu(), [])

  return (
    <MenuBrowser
      fetchMenu={fetchMenu}
      fetchKey="full"
      title="The full menu"
      header={<CafeHeader menuActive onBack={onBack} />}
    />
  )
}
