import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { z } from 'zod'
import { Avatar } from '../../components/ui/Avatar'
import { AvatarPicker } from '../../components/ui/AvatarPicker'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import {
  ContactPicker,
  type PickedPerson,
} from '../chat/components/ContactPicker'
import { DESCRIPTION_LIMIT } from './communityService'
import { useCommunityActions } from './useCommunityActions'

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the community a name.')
    .max(100, 'Use at most 100 characters.'),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_LIMIT, `Use at most ${DESCRIPTION_LIMIT} characters.`),
})
type Values = z.infer<typeof schema>

export function CreateCommunityModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const actions = useCommunityActions()
  const [members, setMembers] = useState<PickedPerson[]>([])
  const [busy, setBusy] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '' },
  })
  const watchName = useWatch({ control, name: 'name', defaultValue: '' })
  const description = useWatch({
    control,
    name: 'description',
    defaultValue: '',
  })

  const toggle = (person: PickedPerson) =>
    setMembers((current) =>
      current.some((member) => member.userId === person.userId)
        ? current.filter((member) => member.userId !== person.userId)
        : [...current, person],
    )

  const submit = handleSubmit(async (values) => {
    setBusy(true)
    const id = await actions.create(
      values.name,
      values.description,
      members.map((member) => member.userId),
      photo,
    )
    setBusy(false)
    if (!id) return
    reset()
    setMembers([])
    setPhoto(null)
    onClose()
    navigate(`/communities/${id}`)
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New community"
      description="A community brings related groups together, with an announcements group only admins can post in."
      className="max-w-lg"
    >
      <form
        onSubmit={(event) => void submit(event)}
        className="grid gap-4"
        noValidate
      >
        <div className="flex justify-center">
          <AvatarPicker
            name={watchName}
            shape="square"
            size={88}
            previewFile={photo}
            onPick={setPhoto}
            onRemove={() => setPhoto(null)}
          />
        </div>
        <Input
          label="Community name"
          maxLength={100}
          data-autofocus
          error={errors.name?.message}
          {...register('name')}
        />
        <div className="grid gap-1.5">
          <label
            htmlFor="community-description"
            className="text-[13px] font-medium text-muted"
          >
            Description (optional)
          </label>
          <textarea
            id="community-description"
            rows={3}
            maxLength={DESCRIPTION_LIMIT}
            className="resize-none rounded-lg border border-divider bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            {...register('description')}
          />
          <div className="flex justify-between text-xs">
            <span role="alert" className="text-danger">
              {errors.description?.message}
            </span>
            <span className="text-muted">
              {description.length}/{DESCRIPTION_LIMIT}
            </span>
          </div>
        </div>
        <div className="grid gap-2">
          <h3 className="text-[13px] font-medium text-muted">
            Invite people now (optional)
          </h3>
          {members.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="People to invite">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-1.5 rounded-full bg-panel py-1 pl-1 pr-2 text-[13px]"
                >
                  <Avatar
                    name={member.displayName}
                    path={member.avatarPath}
                    size={22}
                  />
                  {member.displayName}
                  <button
                    type="button"
                    aria-label={`Remove ${member.displayName}`}
                    onClick={() => toggle(member)}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ContactPicker
            onPick={toggle}
            selectedIds={new Set(members.map((member) => member.userId))}
            emptyHint="You can also share an invite link after creating it."
          />
        </div>
        <Button type="submit" loading={busy}>
          Create community
        </Button>
      </form>
    </Modal>
  )
}
