import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { CommunityPhoto } from './CommunityPhoto'
import { DESCRIPTION_LIMIT, type Community } from './communityService'
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

export function EditCommunityModal({
  community,
  open,
  onClose,
}: {
  community: Community
  open: boolean
  onClose: () => void
}) {
  const actions = useCommunityActions()
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: community.name, description: community.description },
  })
  const description = useWatch({
    control,
    name: 'description',
    defaultValue: community.description,
  })
  useEffect(() => {
    if (open)
      reset({ name: community.name, description: community.description })
  }, [community, open, reset])

  const submit = handleSubmit(async (values) => {
    if (await actions.update(community.id, values.name, values.description))
      onClose()
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit community"
      description="The community and its announcements group share one name."
    >
      <div className="mb-4 flex justify-center">
        <CommunityPhoto community={community} size={96} />
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        className="grid gap-4"
        noValidate
      >
        <Input
          label="Community name"
          maxLength={100}
          data-autofocus
          error={errors.name?.message}
          {...register('name')}
        />
        <div className="grid gap-1.5">
          <label
            htmlFor="edit-description"
            className="text-[13px] font-medium text-muted"
          >
            Description
          </label>
          <textarea
            id="edit-description"
            rows={4}
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
        <Button type="submit" loading={isSubmitting}>
          Save
        </Button>
      </form>
    </Modal>
  )
}
