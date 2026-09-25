import {
  CircleDashed,
  MessageCircle,
  Phone,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { useMyProfile } from '../../features/profile/useProfile'

type Item = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: number
}

function RailLink({ item }: { item: Item }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      aria-label={item.label}
      title={item.label}
      className={({ isActive }) =>
        cn(
          'relative grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent md:h-11 md:w-11',
          isActive && 'bg-surface-hover text-text',
        )
      }
    >
      <Icon icon={item.icon} size={24} />
      {item.badge ? (
        <span className="absolute -right-0.5 -top-0.5 min-w-[20px] rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      ) : null}
    </NavLink>
  )
}

/** Vertical rail on desktop, bottom tab bar on small screens. */
export function NavRail({
  unread,
  hidden,
}: {
  unread: number
  hidden: boolean
}) {
  const { data: profile } = useMyProfile()
  const top: Item[] = [
    { to: '/', label: 'Chats', icon: MessageCircle, end: false, badge: unread },
    { to: '/calls', label: 'Calls', icon: Phone },
    { to: '/status', label: 'Status', icon: CircleDashed },
    { to: '/communities', label: 'Communities', icon: Users },
  ]
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'z-10 flex shrink-0 items-center justify-around border-t border-divider bg-panel py-1.5 md:h-full md:w-16 md:flex-col md:justify-between md:border-r md:border-t-0 md:px-0 md:py-4',
        hidden && 'hidden md:flex',
      )}
    >
      <div className="flex items-center gap-1 md:flex-col md:gap-2">
        {top.map((item) => (
          <RailLink key={item.to} item={item} />
        ))}
      </div>
      <div className="flex items-center gap-1 md:flex-col md:gap-3">
        <RailLink
          item={{ to: '/settings', label: 'Settings', icon: Settings }}
        />
        <NavLink
          to="/settings/profile"
          aria-label="Your profile"
          title="Your profile"
          className="hidden rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent md:block"
        >
          <Avatar
            name={profile?.display_name ?? 'You'}
            path={profile?.avatar_url}
            size={36}
          />
        </NavLink>
      </div>
    </nav>
  )
}
