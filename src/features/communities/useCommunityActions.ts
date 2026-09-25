import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../components/ui/ToastContext'
import { errorMessage } from '../../lib/errors'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { leaveChat } from '../chat/chatService'
import { uploadPhotoAfterCreate } from '../chat/useChatAvatar'
import * as service from './communityService'
import type { Community } from './communityService'

/** Community mutations that keep every affected cache in step and turn failures into readable toasts. */
export function useCommunityActions() {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { notify } = useToast()

  const refresh = useCallback(
    async (communityId?: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.communities(userId) }),
        queryClient.invalidateQueries({ queryKey: keys.chats(userId) }),
        communityId
          ? queryClient.invalidateQueries({
              queryKey: keys.communityGroups(communityId),
            })
          : Promise.resolve(),
      ])
    },
    [queryClient, userId],
  )

  /** Runs a mutation; resolves true on success so callers can close dialogs. */
  const run = useCallback(
    async (
      task: () => Promise<void>,
      failure: string,
      communityId?: string,
      success?: string,
    ): Promise<boolean> => {
      try {
        await task()
        await refresh(communityId)
        if (success) notify(success, 'success')
        return true
      } catch (error) {
        notify(errorMessage(error, failure), 'error')
        return false
      }
    },
    [notify, refresh],
  )

  return {
    create: async (
      name: string,
      description: string,
      memberIds: string[],
      photo: File | null = null,
    ): Promise<string | null> => {
      try {
        const id = await service.createCommunity(name, description, memberIds)
        if (photo) {
          // The photo belongs to the announcements group, which only exists now.
          const created = (await service.loadCommunities()).find(
            (item) => item.id === id,
          )
          if (created)
            await uploadPhotoAfterCreate(
              created.announcementChatId,
              photo,
              notify,
            )
        }
        await refresh()
        return id
      } catch (error) {
        notify(errorMessage(error, 'Could not create the community.'), 'error')
        return null
      }
    },
    update: (id: string, name: string, description: string) =>
      run(
        () => service.updateCommunity(id, name, description),
        'Could not save the community.',
        id,
        'Community updated.',
      ),
    addGroup: (id: string, chatId: string) =>
      run(
        () => service.addGroupToCommunity(id, chatId),
        'Could not add that group.',
        id,
        'Group added to the community.',
      ),
    removeGroup: (id: string, chatId: string) =>
      run(
        () => service.removeGroupFromCommunity(id, chatId),
        'Could not remove that group.',
        id,
        'Group removed from the community.',
      ),
    createGroup: async (
      id: string,
      name: string,
      photo: File | null = null,
    ): Promise<string | null> => {
      try {
        const chatId = await service.createGroupInCommunity(id, name)
        await uploadPhotoAfterCreate(chatId, photo, notify)
        await refresh(id)
        return chatId
      } catch (error) {
        notify(errorMessage(error, 'Could not create the group.'), 'error')
        return null
      }
    },
    joinGroup: (id: string, chatId: string) =>
      run(
        () => service.joinCommunityGroup(chatId),
        'Could not join that group.',
        id,
      ),
    /** Leaving the announcements chat is leaving the community; the database removes you from its groups too. */
    leave: async (community: Community): Promise<boolean> => {
      const done = await run(
        () => leaveChat(community.announcementChatId, userId),
        'Could not leave the community.',
        community.id,
        `You left ${community.name}.`,
      )
      if (done) navigate('/communities', { replace: true })
      return done
    },
    deactivate: async (community: Community): Promise<boolean> => {
      const done = await run(
        () => service.deactivateCommunity(community.id),
        'Could not deactivate the community.',
        community.id,
        `${community.name} was deactivated.`,
      )
      if (done) navigate('/communities', { replace: true })
      return done
    },
  }
}
