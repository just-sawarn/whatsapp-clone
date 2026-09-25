import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Download, KeyRound, Laptop, Link2, Upload } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { Input } from '../../../components/ui/Input'
import { useToast } from '../../../components/ui/ToastContext'
import { publicKeyFingerprint } from '../../../lib/crypto/crypto'
import { getStoredPublicKey } from '../../../lib/crypto/keyStore'
import { errorMessage } from '../../../lib/errors'
import { useAuth } from '../../auth/AuthContext'
import { passwordStrength } from '../../auth/authSchemas'
import { useEncryptionPrompt } from '../../auth/EncryptionPromptContext'
import { PasswordStrengthMeter } from '../../auth/PasswordStrengthMeter'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import { usePreferences } from '../../preferences/PreferencesContext'
import { Switch } from '../../../components/ui/Switch'
import { SettingRow, SettingsCard, SettingsPanel } from '../SettingsPanel'

const passwordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password.'),
    next: z.string().min(8, 'Use at least 8 characters.'),
    confirm: z.string(),
  })
  .refine((values) => values.next === values.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match.',
  })
type PasswordValues = z.infer<typeof passwordSchema>

function groupHex(value: string): string[] {
  return value.match(/.{1,8}/g) ?? []
}

function browserName(): string {
  const agent = navigator.userAgent
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Chrome\//.test(agent)
      ? 'Chrome'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'Browser'
  const system = /Mac OS X/.test(agent)
    ? 'macOS'
    : /Windows/.test(agent)
      ? 'Windows'
      : /Android/.test(agent)
        ? 'Android'
        : /iPhone|iPad/.test(agent)
          ? 'iOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : ''
  return system ? `${browser} on ${system}` : browser
}

export function SecuritySection() {
  const userId = useCurrentUserId()
  const {
    identityState,
    exportKeyBackup,
    importKeyBackup,
    changePassword,
    loginExpiresAt,
  } = useAuth()
  const { stayUnlocked, update } = usePreferences()
  const prompt = useEncryptionPrompt()
  const { notify } = useToast()
  const picker = useRef<HTMLInputElement>(null)
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) })
  const nextPassword = useWatch({ control, name: 'next', defaultValue: '' })

  useEffect(() => {
    let active = true
    void getStoredPublicKey(userId)
      .then((key) => key && publicKeyFingerprint(key))
      .then((value) => active && setFingerprint(value || null))
    return () => {
      active = false
    }
  }, [userId, identityState])

  const download = async () => {
    try {
      const url = URL.createObjectURL(
        new Blob([await exportKeyBackup()], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = 'chatbit-key-backup.json'
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  const restore = async (file: File | undefined) => {
    if (!file) return
    try {
      await importKeyBackup(await file.text())
      notify(
        'Backup loaded. Unlock it with the password that protected it.',
        'success',
      )
      prompt.open()
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  const submit = handleSubmit(async (values) => {
    setSaving(true)
    try {
      await changePassword(values.current, values.next)
      reset()
      notify(
        'Password changed. Your encryption key was re-protected with it.',
        'success',
      )
    } catch (error) {
      notify(errorMessage(error, 'Could not change your password.'), 'error')
    } finally {
      setSaving(false)
    }
  })

  return (
    <SettingsPanel title="Security">
      <SettingsCard
        title="Staying signed in"
        description="You sign in once and stay signed in for 7 days. Your encryption key is unlocked with your password at sign-in, and can stay unlocked on this device for the same period so reloading the page does not ask again."
      >
        <SettingRow
          label="Stay unlocked on this device"
          description={
            loginExpiresAt
              ? `Your login ends on ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(loginExpiresAt))}, or sooner if you log out.`
              : undefined
          }
          control={
            <Switch
              label="Stay unlocked on this device"
              checked={stayUnlocked}
              onChange={(value) => update({ stayUnlocked: value })}
            />
          }
        />
        <p className="text-[12.5px] leading-relaxed text-muted">
          While this is on, an unlocked copy of your key that scripts cannot
          read out (but this browser can use) is kept on this device. Anyone who
          can use this browser profile could read your messages until the login
          ends. Turn it off on shared or public computers. Logging out always
          removes it.
        </p>
      </SettingsCard>
      <SettingsCard
        title="Your encryption key"
        description="Messages are encrypted with a key that is created on this device and protected by your password. Only the public half is stored on the server."
      >
        <div className="flex items-center gap-3 text-[14.5px]">
          <Icon icon={KeyRound} size={20} className="text-link" />
          {identityState === 'unlocked'
            ? 'Unlocked on this device'
            : identityState === 'locked'
              ? 'Locked. Enter your password to use it.'
              : identityState === 'missing'
                ? 'No key on this device'
                : 'Checking…'}
          {(identityState === 'locked' || identityState === 'missing') && (
            <Button
              variant="secondary"
              className="ml-auto h-9 px-4 text-[13px]"
              onClick={prompt.open}
            >
              {identityState === 'missing' ? 'Restore' : 'Unlock'}
            </Button>
          )}
        </div>
        {fingerprint && (
          <div>
            <h3 className="mb-1.5 text-[13px] font-medium text-muted">
              Key fingerprint
            </h3>
            <div
              className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-panel p-3 font-mono text-[13px] sm:grid-cols-4"
              aria-label="Key fingerprint"
            >
              {groupHex(fingerprint).map((group, index) => (
                <span key={index}>{group}</span>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">
              To check a specific conversation, open its contact info and choose
              Verify security code.
            </p>
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title="Key backup"
        description="Your key exists only on this device. Save a backup so you can read your messages on a new device or after clearing browser data. The file is protected by your password."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => void download()}
            disabled={identityState === 'missing' || identityState === null}
          >
            Download backup
          </Button>
          {identityState === 'missing' && (
            <Button
              variant="secondary"
              icon={Upload}
              onClick={() => picker.current?.click()}
            >
              Restore backup
            </Button>
          )}
          <input
            ref={picker}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              void restore(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Anyone with the file and your password can read your messages, so
          store it somewhere private.
        </p>
      </SettingsCard>

      <SettingsCard
        title="Change password"
        description="Your encryption key is re-protected with the new password automatically."
      >
        <form
          onSubmit={(event) => void submit(event)}
          className="grid gap-4"
          noValidate
        >
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={errors.current?.message}
            {...register('current')}
          />
          <div className="grid gap-2">
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              error={errors.next?.message}
              {...register('next')}
            />
            <PasswordStrengthMeter password={nextPassword} />
          </div>
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={errors.confirm?.message}
            {...register('confirm')}
          />
          <Button
            type="submit"
            loading={saving}
            disabled={passwordStrength(nextPassword).score < 1}
            className="justify-self-start"
          >
            Change password
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard title="Devices">
        <div className="flex items-center gap-3 text-[14.5px]">
          <Icon icon={Laptop} size={20} className="text-muted" />
          <span>This device · {browserName()}</span>
          <span className="ml-auto text-xs text-link">Active now</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Messages are not synced between devices automatically. To use another
          device, restore your key backup there.
        </p>
      </SettingsCard>

      <SettingsCard title="Link previews and privacy">
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
          <Icon icon={Link2} size={16} className="mt-0.5 shrink-0" />
          When you send a link, a small server function fetches that page to
          build the preview card, so it sees the link itself (never the rest of
          your message). The preview is then encrypted with the message. Skip
          the preview by dismissing it before you send.
        </p>
      </SettingsCard>
    </SettingsPanel>
  )
}
