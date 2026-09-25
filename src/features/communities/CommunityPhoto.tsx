import { Avatar } from '../../components/ui/Avatar'
import { AvatarPicker } from '../../components/ui/AvatarPicker'
import { buckets } from '../../lib/storageUrls'
import { useChatAvatar } from '../chat/useChatAvatar'
import type { Community } from './communityService'

/**
 * The community's photo. Admins can change or remove it; for everyone else it is a plain picture. It is stored as
 * the photo of the community's announcements group, which is what lets members load it.
 */
export function CommunityPhoto({
  community,
  size = 96,
}: {
  community: Community
  size?: number
}) {
  const photo = useChatAvatar(
    community.announcementChatId,
    community.avatarPath,
  )
  if (community.myRole !== 'admin') {
    return (
      <Avatar
        name={community.name}
        path={community.avatarPath}
        bucket={buckets.chatAvatars}
        shape="square"
        size={size}
      />
    )
  }
  return (
    <AvatarPicker
      name={community.name}
      path={community.avatarPath}
      bucket={buckets.chatAvatars}
      shape="square"
      size={size}
      busy={photo.busy}
      onPick={(file) => void photo.upload(file)}
      onRemove={() => void photo.remove()}
    />
  )
}
