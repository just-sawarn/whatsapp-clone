import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { z } from 'zod'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { Input } from '../../../components/ui/Input'
import { Spinner } from '../../../components/ui/Spinner'
import { useToast } from '../../../components/ui/ToastContext'
import { errorMessage } from '../../../lib/errors'
import {
  isUsernameAvailable,
  removeAvatar,
  updateProfile,
  uploadAvatar,
} from '../../../lib/profile'
import { keys } from '../../../lib/queryKeys'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import {
  aboutSchema,
  displayNameSchema,
  normalizeUsername,
  usernameSchema,
} from '../../onboarding/onboardingSchemas'
import { useMyProfile } from '../../profile/useProfile'
import { SettingsCard, SettingsPanel } from '../SettingsPanel'

const schema = displayNameSchema.merge(usernameSchema).merge(aboutSchema)
type Values = z.infer<typeof schema>

export function ProfileSection() {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const { data: profile } = useMyProfile()
  const picker = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [taken, setTaken] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', username: '', about: '' },
  })

  useEffect(() => {
    if (profile)
      reset({
        displayName: profile.display_name,
        username: profile.username,
        about: profile.about ?? '',
      })
  }, [profile, reset])

  const username = watch('username')
  const debouncedUsername = useDebouncedValue(username, 400)
  useEffect(() => {
    let active = true
    if (
      !profile ||
      debouncedUsername === profile.username ||
      !/^[a-z0-9_]{3,20}$/.test(debouncedUsername)
    ) {
      setTaken(false)
      return
    }
    isUsernameAvailable(debouncedUsername)
      .then((free) => active && setTaken(!free))
      .catch(() => active && setTaken(false))
    return () => {
      active = false
    }
  }, [debouncedUsername, profile])

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: keys.profile(userId) })

  const changePhoto = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      await uploadAvatar(userId, file, profile?.avatar_url ?? null)
      await refresh()
      notify('Profile photo updated.', 'success')
    } catch (error) {
      notify(errorMessage(error, 'Could not update your photo.'), 'error')
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = async () => {
    if (!profile?.avatar_url) return
    try {
      await removeAvatar(userId, profile.avatar_url)
      await refresh()
    } catch (error) {
      notify(errorMessage(error, 'Could not remove your photo.'), 'error')
    }
  }

  const save = handleSubmit(async (values) => {
    if (taken) return
    setSaving(true)
    try {
      await updateProfile(userId, {
        display_name: values.displayName.trim(),
        username: values.username,
        about: values.about.trim(),
      })
      await refresh()
      notify('Profile saved.', 'success')
    } catch (error) {
      const message = errorMessage(error, 'Could not save your profile.')
      notify(
        /duplicate|unique/i.test(message)
          ? 'That username is already taken.'
          : message,
        'error',
      )
    } finally {
      setSaving(false)
    }
  })

  return (
    <SettingsPanel title="Profile">
      <SettingsCard>
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => picker.current?.click()}
            aria-label="Change profile photo"
            className="group relative rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Avatar
              name={profile?.display_name ?? 'You'}
              path={profile?.avatar_url}
              size={96}
            />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {uploading ? (
                <Spinner size={20} />
              ) : (
                <Icon icon={Camera} size={24} />
              )}
            </span>
          </button>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              void changePhoto(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <div className="grid gap-1.5">
            <Button variant="secondary" onClick={() => picker.current?.click()}>
              Change photo
            </Button>
            {profile?.avatar_url && (
              <Button
                variant="ghost"
                className="text-danger"
                onClick={() => void removePhoto()}
              >
                Remove photo
              </Button>
            )}
          </div>
        </div>
      </SettingsCard>
      <SettingsCard>
        <form
          onSubmit={(event) => void save(event)}
          className="grid gap-4"
          noValidate
        >
          <Input
            label="Name"
            maxLength={80}
            error={errors.displayName?.message}
            {...register('displayName')}
          />
          <Input
            label="Username"
            hint="People find you by this handle."
            error={
              errors.username?.message ??
              (taken ? 'That username is already taken.' : undefined)
            }
            {...register('username', {
              onChange: (event) =>
                setValue('username', normalizeUsername(event.target.value)),
            })}
          />
          <Input
            label="About"
            maxLength={140}
            error={errors.about?.message}
            {...register('about')}
          />
          <Button
            type="submit"
            loading={saving}
            disabled={!isDirty || taken}
            className="justify-self-start"
          >
            Save changes
          </Button>
        </form>
      </SettingsCard>
    </SettingsPanel>
  )
}
