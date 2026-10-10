import { useCallback } from 'react'
import { getFullMenu } from '../../api'
import MenuBrowser from '../../components/MenuBrowser'
import ManagerHeader from '../../components/ManagerHeader'

interface Props {
  onBack: () => void
}

/** The manager's view of the full menu: the same browser as customers see, but
 *  the dish cards and detail sheet manage stock instead of ordering. */
export default function ManagerMenu({ onBack }: Props) {
  const fetchMenu = useCallback(() => getFullMenu(), [])

  return (
    <MenuBrowser
      managerMode
      fetchMenu={fetchMenu}
      fetchKey="manager-full"
      title="Full menu"
      header={<ManagerHeader onBack={onBack} />}
    />
  )
}
