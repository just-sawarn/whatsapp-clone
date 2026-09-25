import {
  Bell,
  Database,
  KeyRound,
  Palette,
  ShieldCheck,
  Star,
  UserRound,
  UserX,
  type LucideIcon,
} from 'lucide-react'

export type SectionId =
  | 'profile'
  | 'privacy'
  | 'notifications'
  | 'chats'
  | 'storage'
  | 'security'
  | 'starred'
  | 'account'

export const sections: Array<{
  id: SectionId
  label: string
  description: string
  icon: LucideIcon
}> = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Photo, name, username, about',
    icon: UserRound,
  },
  {
    id: 'privacy',
    label: 'Privacy',
    description: 'Last seen, read receipts, blocked contacts',
    icon: ShieldCheck,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Sounds and browser alerts',
    icon: Bell,
  },
  {
    id: 'chats',
    label: 'Chats',
    description: 'Theme, wallpaper, font size',
    icon: Palette,
  },
  {
    id: 'starred',
    label: 'Starred messages',
    description: 'Messages you saved',
    icon: Star,
  },
  {
    id: 'storage',
    label: 'Storage and data',
    description: 'Local message cache',
    icon: Database,
  },
  {
    id: 'security',
    label: 'Security',
    description: 'Encryption key, backup, password',
    icon: KeyRound,
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Log out or delete your account',
    icon: UserX,
  },
]
