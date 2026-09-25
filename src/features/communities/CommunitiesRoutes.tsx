import { Route, Routes } from 'react-router-dom'
import CommunitiesLayout, { CommunitiesWelcome } from './CommunitiesLayout'
import { CommunityDetail } from './CommunityDetail'
import { JoinCommunityPage } from './JoinCommunityPage'

/** Everything under /communities, loaded as one lazy chunk. */
export default function CommunitiesRoutes() {
  return (
    <Routes>
      <Route element={<CommunitiesLayout />}>
        <Route index element={<CommunitiesWelcome />} />
        <Route path="join/:code" element={<JoinCommunityPage />} />
        <Route path=":id" element={<CommunityDetail />} />
      </Route>
    </Routes>
  )
}
