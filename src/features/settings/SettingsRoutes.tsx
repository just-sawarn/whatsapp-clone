import { Route, Routes } from 'react-router-dom'
import SettingsLayout, { SettingsWelcome } from './SettingsLayout'
import { AccountSection } from './sections/AccountSection'
import { ChatsSection } from './sections/ChatsSection'
import { NotificationsSection } from './sections/NotificationsSection'
import { PrivacySection } from './sections/PrivacySection'
import { ProfileSection } from './sections/ProfileSection'
import { SecuritySection } from './sections/SecuritySection'
import { StarredSection } from './sections/StarredSection'
import { StorageSection } from './sections/StorageSection'

/** Everything under /settings, loaded as one lazy chunk. */
export default function SettingsRoutes() {
  return (
    <Routes>
      <Route element={<SettingsLayout />}>
        <Route index element={<SettingsWelcome />} />
        <Route path="profile" element={<ProfileSection />} />
        <Route path="privacy" element={<PrivacySection />} />
        <Route path="notifications" element={<NotificationsSection />} />
        <Route path="chats" element={<ChatsSection />} />
        <Route path="starred" element={<StarredSection />} />
        <Route path="storage" element={<StorageSection />} />
        <Route path="security" element={<SecuritySection />} />
        <Route path="account" element={<AccountSection />} />
      </Route>
    </Routes>
  )
}
