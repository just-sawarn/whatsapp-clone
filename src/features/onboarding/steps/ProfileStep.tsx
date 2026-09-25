import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Camera } from 'lucide-react'
import { Avatar } from '../../../components/ui/Avatar'
import { Icon } from '../../../components/ui/Icon'
import { Input } from '../../../components/ui/Input'
import { Spinner } from '../../../components/ui/Spinner'
import { errorMessage } from '../../../lib/errors'
import { uploadAvatar } from '../../../lib/profile'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import { displayNameSchema } from '../onboardingSchemas'
import type { OnboardingData } from '../useOnboardingState'
import { StepFrame } from './StepFrame'

type Props = {
  data: OnboardingData
  save: (patch: Partial<OnboardingData>) => void
  next: () => void
}

/** Live preview: how the name and photo will look at the top of a chat and in a bubble. */
function MockChat({
  name,
  avatarPath,
}: {
  name: string
  avatarPath: string | null
}) {
  const shown = name.trim() || 'Your name'
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl border border-divider"
    >
      <div className="flex items-center gap-2.5 bg-panel px-3 py-2">
        <Avatar name={shown} path={avatarPath} size={32} />
        <strong className="truncate text-[14px] font-normal">{shown}</strong>
      </div>
      <div className="bg-chat-bg px-3 py-3">
        <div className="w-fit max-w-[80%] rounded-lg rounded-tl-none bg-bubble-in px-2.5 py-1.5 text-[13.5px] shadow-bubble">
          <strong className="block text-[12.5px] font-medium text-link">
            {shown}
          </strong>
          Hi! This is how I will look to you.
        </div>
      </div>
    </div>
  )
}

export function ProfileStep({ data, save, next }: Props) {
  const userId = useCurrentUserId()
  const picker = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { displayName: data.displayName },
  })
  const name =
    useWatch({
      control,
      name: 'displayName',
      defaultValue: data.displayName,
    }) ?? ''

  const choose = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      save({ avatarPath: await uploadAvatar(userId, file, data.avatarPath) })
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload that photo.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <StepFrame
      title="Make it yours"
      description="Add a photo and the name people will see when you message them."
      onSubmit={() =>
        void handleSubmit((values) => {
          save({ displayName: values.displayName.trim() })
          next()
        })()
      }
      error={error}
    >
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => picker.current?.click()}
          aria-label="Choose a profile photo"
          className="group relative rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Avatar name={name || 'You'} path={data.avatarPath} size={112} />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {uploading ? (
              <Spinner size={22} />
            ) : (
              <Icon icon={Camera} size={26} />
            )}
          </span>
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            void choose(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>
      <Input
        label="Your name"
        autoComplete="name"
        maxLength={80}
        autoFocus
        error={errors.displayName?.message}
        {...register('displayName')}
      />
      <MockChat name={name} avatarPath={data.avatarPath} />
    </StepFrame>
  )
}
