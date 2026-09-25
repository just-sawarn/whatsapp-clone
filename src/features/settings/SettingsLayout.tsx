import { Outlet, useMatch, useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { SplitLayout } from '../../components/layout/SplitLayout'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { cn } from '../../lib/cn'
import { useMyProfile } from '../profile/useProfile'
import { sections } from './sections'

function Menu({ active }: { active: string | undefined }) {
  const navigate = useNavigate()
  const { data: profile } = useMyProfile()
  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center bg-panel px-5">
        <h1 className="text-[22px] font-semibold">Settings</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <button
          type="button"
          onClick={() => navigate('/settings/profile')}
          className="flex w-full items-center gap-4 border-b border-divider px-5 py-4 text-left hover:bg-surface-hover"
        >
          <Avatar
            name={profile?.display_name ?? 'You'}
            path={profile?.avatar_url}
            size={64}
          />
          <span className="min-w-0">
            <strong className="block truncate text-[18px] font-normal">
              {profile?.display_name ?? 'Your profile'}
            </strong>
            <span className="block truncate text-[14px] text-muted">
              {profile?.about ?? ''}
            </span>
          </span>
        </button>
        <nav aria-label="Settings sections">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => navigate(`/settings/${section.id}`)}
              aria-current={active === section.id ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-surface-hover',
                active === section.id && 'bg-panel',
              )}
            >
              <Icon icon={section.icon} size={22} className="text-muted" />
              <span className="min-w-0 border-b border-divider pb-3 pt-0.5 flex-1">
                <span className="block text-[16px]">{section.label}</span>
                <span className="block truncate text-[13px] text-muted">
                  {section.description}
                </span>
              </span>
            </button>
          ))}
        </nav>
      </div>
    </>
  )
}

export default function SettingsLayout() {
  const section = useMatch('/settings/:section')?.params.section
  return (
    <SplitLayout
      list={<Menu active={section} />}
      detail={<Outlet />}
      hasDetail={section !== undefined}
    />
  )
}

export function SettingsWelcome() {
  return (
    <div className="grid h-full w-full place-items-center bg-panel">
      <EmptyState
        icon={Settings}
        title="Settings"
        description="Choose a section on the left to manage your profile, privacy, notifications and security."
      />
    </div>
  )
}
