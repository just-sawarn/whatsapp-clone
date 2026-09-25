import { useQueryClient } from '@tanstack/react-query'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Switch } from '../../../components/ui/Switch'
import { useToast } from '../../../components/ui/ToastContext'
import { errorMessage } from '../../../lib/errors'
import {
  updateProfile,
  type Discoverability,
  type PhotoVisibility,
  type ProfilePatch,
} from '../../../lib/profile'
import { keys } from '../../../lib/queryKeys'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import { setBlocked } from '../../contacts/contactsService'
import { useContacts } from '../../contacts/useContacts'
import { useMyProfile } from '../../profile/useProfile'
import { SettingRow, SettingsCard, SettingsPanel } from '../SettingsPanel'

export function PrivacySection() {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const { data: profile } = useMyProfile()
  const { data: contacts = [] } = useContacts()
  const blocked = contacts.filter((contact) => contact.isBlocked)

  const change = async (patch: ProfilePatch) => {
    try {
      await updateProfile(userId, patch)
      await queryClient.invalidateQueries({ queryKey: keys.profile(userId) })
    } catch (error) {
      notify(errorMessage(error, 'Could not save that setting.'), 'error')
    }
  }

  const unblock = async (contactId: string) => {
    try {
      await setBlocked(userId, contactId, false)
      await queryClient.invalidateQueries({ queryKey: keys.contacts(userId) })
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  if (!profile)
    return (
      <SettingsPanel title="Privacy">
        <p className="text-sm text-muted">Loading…</p>
      </SettingsPanel>
    )

  return (
    <SettingsPanel title="Privacy">
      <SettingsCard
        title="Who can see my personal info"
        description="Last seen and read receipts work both ways: if you turn them off, you also stop seeing them for other people."
      >
        <SettingRow
          label="Last seen and online"
          description="Show when you were last active."
          control={
            <Switch
              label="Last seen and online"
              checked={profile.show_last_seen}
              onChange={(value) => void change({ show_last_seen: value })}
            />
          }
        />
        <SettingRow
          label="Read receipts"
          description="Blue ticks when you have read a message. Group chats always send delivery ticks."
          control={
            <Switch
              label="Read receipts"
              checked={profile.show_read_receipts}
              onChange={(value) => void change({ show_read_receipts: value })}
            />
          }
        />
        <Select<PhotoVisibility>
          label="Profile photo"
          value={profile.show_profile_photo}
          onChange={(value) => void change({ show_profile_photo: value })}
          options={[
            { value: 'everyone', label: 'Everyone' },
            { value: 'contacts', label: 'My contacts' },
            { value: 'nobody', label: 'Nobody' },
          ]}
        />
      </SettingsCard>
      <SettingsCard
        title="Finding me"
        description="This is enforced by the server, not just hidden in the interface."
      >
        <Select<Discoverability>
          label="People can find me by"
          value={profile.discoverable_by}
          onChange={(value) => void change({ discoverable_by: value })}
          options={[
            { value: 'username', label: 'Username only' },
            { value: 'username_and_email', label: 'Username or email address' },
            {
              value: 'nobody',
              label: 'Nobody (people I message can still reply)',
            },
          ]}
        />
      </SettingsCard>
      <SettingsCard
        title={`Blocked contacts (${blocked.length})`}
        description="You will not see messages from blocked contacts, and they cannot call you or see your status. They are not told."
      >
        {blocked.length === 0 ? (
          <p className="text-[13.5px] text-muted">
            You have not blocked anyone.
          </p>
        ) : (
          <ul className="grid gap-2">
            {blocked.map((contact) => (
              <li key={contact.userId} className="flex items-center gap-3">
                <Avatar
                  name={contact.displayName}
                  path={contact.avatarPath}
                  size={40}
                />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[15px] font-normal">
                    {contact.displayName}
                  </strong>
                  <span className="text-[13px] text-muted">
                    @{contact.username}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  className="h-9 px-4 text-[13px]"
                  onClick={() => void unblock(contact.userId)}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
    </SettingsPanel>
  )
}
