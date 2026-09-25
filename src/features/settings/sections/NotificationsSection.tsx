import { useState } from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { Select } from '../../../components/ui/Select'
import { Switch } from '../../../components/ui/Switch'
import { useToast } from '../../../components/ui/ToastContext'
import { errorMessage } from '../../../lib/errors'
import {
  notificationPermission,
  pushConfigured,
  requestNotificationPermission,
} from '../../../lib/notifications'
import {
  messageSoundLabels,
  playMessageSound,
  playRingPreview,
} from '../../../lib/sounds'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import {
  usePreferences,
  type MessageSound,
} from '../../preferences/PreferencesContext'
import { SettingRow, SettingsCard, SettingsPanel } from '../SettingsPanel'
import { disablePush, enablePush } from '../pushService'

export function NotificationsSection() {
  const userId = useCurrentUserId()
  const { notify } = useToast()
  const preferences = usePreferences()
  const [permission, setPermission] = useState(notificationPermission())
  const [pushOn, setPushOn] = useState(false)

  const allow = async () => setPermission(await requestNotificationPermission())

  const togglePush = async (next: boolean) => {
    try {
      if (next) setPushOn(await enablePush(userId))
      else {
        await disablePush(userId)
        setPushOn(false)
      }
    } catch (error) {
      notify(
        errorMessage(error, 'Could not change background notifications.'),
        'error',
      )
    }
  }

  const soundOptions: Array<{ value: MessageSound; label: string }> = [
    { value: 'off', label: 'Off' },
    ...(
      Object.entries(messageSoundLabels) as Array<
        [Exclude<MessageSound, 'off'>, string]
      >
    ).map(([value, label]) => ({ value, label })),
  ]

  return (
    <SettingsPanel title="Notifications">
      <SettingsCard
        title="Browser notifications"
        description="Alerts for new messages and calls while this tab is in the background. Previews are decrypted on your device."
      >
        <SettingRow
          label={
            permission === 'granted'
              ? 'Notifications are on'
              : permission === 'denied'
                ? 'Notifications are blocked'
                : permission === 'unsupported'
                  ? 'Not supported by this browser'
                  : 'Notifications are off'
          }
          description={
            permission === 'denied'
              ? 'Change this in your browser’s site settings.'
              : undefined
          }
          control={
            permission === 'default' ? (
              <Button onClick={() => void allow()}>Turn on</Button>
            ) : null
          }
        />
        {pushConfigured && permission === 'granted' && (
          <SettingRow
            label="Background notifications"
            description="Get alerts even when the app is closed. For privacy these say who messaged you, never what they said."
            control={
              <Switch
                label="Background notifications"
                checked={pushOn}
                onChange={(value) => void togglePush(value)}
              />
            }
          />
        )}
      </SettingsCard>
      <SettingsCard title="Sounds">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Select<MessageSound>
              label="Message sound"
              value={preferences.messageSound}
              options={soundOptions}
              onChange={(value) => {
                preferences.update({ messageSound: value })
                playMessageSound(value)
              }}
            />
          </div>
          <Button
            variant="secondary"
            icon={Volume2}
            onClick={() => playMessageSound(preferences.messageSound)}
            disabled={preferences.messageSound === 'off'}
          >
            Play
          </Button>
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-[13px] font-medium text-muted">
            <label htmlFor="sound-volume">Sound volume</label>
            <span aria-hidden="true">
              {Math.round(preferences.soundVolume * 100)}%
            </span>
          </div>
          <input
            id="sound-volume"
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round(preferences.soundVolume * 100)}
            aria-valuetext={`${Math.round(preferences.soundVolume * 100)} percent`}
            onChange={(event) =>
              preferences.update({
                soundVolume: Number(event.target.value) / 100,
              })
            }
            // Preview when the slider is let go, so dragging is not a burst of sounds.
            onPointerUp={() => playMessageSound(preferences.messageSound)}
            onKeyUp={() => playMessageSound(preferences.messageSound)}
            className="h-2 w-full cursor-pointer accent-[rgb(var(--wa-primary))]"
          />
          <p className="text-[12.5px] leading-relaxed text-muted">
            100% is the loudest the sounds can be. Your device&rsquo;s own
            volume still applies.
          </p>
        </div>
        <SettingRow
          label="Call ringtone"
          description="Ring for incoming calls."
          control={
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                className="h-9 px-4 text-[13px]"
                onClick={playRingPreview}
                disabled={!preferences.ringtone}
              >
                Preview
              </Button>
              <Switch
                label="Call ringtone"
                checked={preferences.ringtone}
                onChange={(value) => preferences.update({ ringtone: value })}
              />
            </div>
          }
        />
        <SettingRow
          label="Sent message sound"
          description="A short tick when a message is sent."
          control={
            <Switch
              label="Sent message sound"
              checked={preferences.sentSound}
              onChange={(value) => preferences.update({ sentSound: value })}
            />
          }
        />
      </SettingsCard>
      <SettingsCard>
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
          <Icon icon={Volume2} size={16} className="mt-0.5 shrink-0" />
          Muting a chat silences its sound and alerts but still counts unread
          messages. Change that from the chat&rsquo;s menu.
        </p>
      </SettingsCard>
    </SettingsPanel>
  )
}
