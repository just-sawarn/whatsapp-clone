import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { LinkIcon, Users } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/ToastContext'
import { errorMessage } from '../../lib/errors'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { joinByInvite, previewInvite } from './communityService'

/** Landing page for an invite link: shows what you are joining and asks for confirmation. */
export function JoinCommunityPage() {
  const { code = '' } = useParams()
  const userId = useCurrentUserId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const {
    data: preview,
    isPending,
    error,
  } = useQuery({
    queryKey: keys.invitePreview(code),
    queryFn: () => previewInvite(code),
    staleTime: 30_000,
  })

  const join = async () => {
    setBusy(true)
    try {
      const id = await joinByInvite(code)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.communities(userId) }),
        queryClient.invalidateQueries({ queryKey: keys.chats(userId) }),
      ])
      notify('You joined the community.', 'success')
      navigate(`/communities/${id}`, { replace: true })
    } catch (joinError) {
      notify(errorMessage(joinError, 'Could not join the community.'), 'error')
      setBusy(false)
    }
  }

  if (isPending)
    return (
      <div className="grid h-full w-full place-items-center bg-panel">
        <Spinner size={24} />
      </div>
    )
  if (error)
    return (
      <div className="grid h-full w-full place-items-center bg-panel">
        <EmptyState
          icon={LinkIcon}
          title="Could not check this link"
          description={errorMessage(error)}
          action={
            <Button onClick={() => navigate('/communities')}>
              Back to communities
            </Button>
          }
        />
      </div>
    )
  if (!preview) {
    return (
      <div className="grid h-full w-full place-items-center bg-panel">
        <EmptyState
          icon={LinkIcon}
          title="This invite link does not work"
          description="It may have been reset by an admin, or it was copied incorrectly. Ask for a new link."
          action={
            <Button onClick={() => navigate('/communities')}>
              Back to communities
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="grid h-full w-full place-items-center bg-panel p-4">
      <section className="grid w-full max-w-sm justify-items-center gap-3 rounded-2xl bg-surface p-8 text-center shadow-popover">
        <Avatar name={preview.name} shape="square" size={96} />
        <h1 className="text-[22px] font-medium">{preview.name}</h1>
        <p className="flex items-center gap-1.5 text-[13.5px] text-muted">
          <Users size={14} /> {preview.memberCount}{' '}
          {preview.memberCount === 1 ? 'member' : 'members'} ·{' '}
          {preview.groupCount} {preview.groupCount === 1 ? 'group' : 'groups'}
        </p>
        {preview.description && (
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">
            {preview.description}
          </p>
        )}
        {preview.alreadyMember ? (
          <Button
            className="mt-2 w-full"
            onClick={() =>
              navigate(`/communities/${preview.communityId}`, { replace: true })
            }
          >
            Open community
          </Button>
        ) : (
          <Button
            className="mt-2 w-full"
            loading={busy}
            onClick={() => void join()}
          >
            Join community
          </Button>
        )}
        <p className="text-[12.5px] leading-relaxed text-muted">
          You will get the community&rsquo;s announcements and can then join its
          groups.
        </p>
      </section>
    </div>
  )
}
