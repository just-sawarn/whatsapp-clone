import { Outlet, useMatch } from 'react-router-dom'
import { Users } from 'lucide-react'
import { SplitLayout } from '../../components/layout/SplitLayout'
import { EmptyState } from '../../components/ui/EmptyState'
import { CommunityList } from './CommunityList'

export default function CommunitiesLayout() {
  const community = useMatch('/communities/:id')?.params.id
  const joining = useMatch('/communities/join/:code') !== null
  return (
    <SplitLayout
      list={<CommunityList activeId={community} />}
      detail={<Outlet />}
      hasDetail={community !== undefined || joining}
    />
  )
}

export function CommunitiesWelcome() {
  return (
    <div className="grid h-full w-full place-items-center bg-panel">
      <EmptyState
        icon={Users}
        title="Communities"
        description="Choose a community on the left to see its announcements and groups, or create one to bring your groups together."
      />
    </div>
  )
}
