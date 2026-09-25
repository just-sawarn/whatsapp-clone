import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Avatar } from '../../../components/ui/Avatar'
import { Icon } from '../../../components/ui/Icon'
import { Spinner } from '../../../components/ui/Spinner'
import { cn } from '../../../lib/cn'
import { errorMessage } from '../../../lib/errors'
import { findProfile, type ProfileSearchResult } from '../../../lib/profile'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import { useContacts } from '../../contacts/useContacts'

export type PickedPerson = {
  userId: string
  displayName: string
  username: string
  avatarPath: string | null
}

type Props = {
  onPick: (person: PickedPerson) => void
  selectedIds?: ReadonlySet<string>
  /** Show the "not in your contacts" hint on results. */
  emptyHint?: string
}

const fromResult = (result: ProfileSearchResult): PickedPerson => ({
  userId: result.id,
  displayName: result.displayName,
  username: result.username,
  avatarPath: result.avatarPath,
})

/** Search by exact @username or email (honouring the target's privacy setting), plus your saved contacts. */
export function ContactPicker({ onPick, selectedIds, emptyHint }: Props) {
  const [text, setText] = useState('')
  const term = useDebouncedValue(text.trim(), 350)
  const { data: contacts = [] } = useContacts()
  const lookup = useQuery({
    queryKey: ['find-profile', term],
    queryFn: () => findProfile(term),
    enabled: term.length >= 3,
    staleTime: 30_000,
  })

  const filtered = contacts.filter(
    (contact) =>
      !contact.isBlocked &&
      (term === '' ||
        `${contact.displayName} ${contact.username}`
          .toLowerCase()
          .includes(term.toLowerCase().replace(/^@/, ''))),
  )
  const found = (lookup.data ?? []).filter(
    (result) => !contacts.some((contact) => contact.userId === result.id),
  )

  const row = (person: PickedPerson, subtitle: string) => {
    const picked = selectedIds?.has(person.userId)
    return (
      <li key={person.userId}>
        <button
          type="button"
          onClick={() => onPick(person)}
          aria-pressed={picked}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-hover',
            picked && 'bg-primary/10',
          )}
        >
          <Avatar
            name={person.displayName}
            path={person.avatarPath}
            size={40}
          />
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-[15px] font-normal">
              {person.displayName}
            </strong>
            <span className="block truncate text-[13px] text-muted">
              {subtitle}
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="grid gap-3">
      <label className="flex h-10 items-center gap-2 rounded-lg bg-panel px-3 text-muted focus-within:ring-2 focus-within:ring-primary/30">
        <Icon icon={Search} size={17} />
        <input
          data-autofocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search contacts, or enter @username or email"
          aria-label="Search contacts, username or email"
          className="w-full bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
        />
      </label>
      <div className="max-h-[46vh] overflow-y-auto">
        {term.length >= 3 && (
          <section aria-label="People found">
            {lookup.isFetching ? (
              <p className="flex items-center gap-2 px-2 py-2 text-[13px] text-muted">
                <Spinner size={14} /> Looking…
              </p>
            ) : lookup.error ? (
              <p role="alert" className="px-2 py-2 text-[13px] text-danger">
                {errorMessage(lookup.error)}
              </p>
            ) : (
              <ul>
                {found.map((result) =>
                  row(
                    fromResult(result),
                    `@${result.username} · not in your contacts`,
                  ),
                )}
              </ul>
            )}
          </section>
        )}
        <section aria-label="Contacts">
          {filtered.length > 0 && (
            <h3 className="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted">
              Contacts
            </h3>
          )}
          <ul>
            {filtered.map((contact) => row(contact, `@${contact.username}`))}
          </ul>
        </section>
        {filtered.length === 0 && found.length === 0 && !lookup.isFetching && (
          <p className="px-2 py-6 text-center text-[13px] leading-relaxed text-muted">
            {term.length >= 3
              ? 'No one found. People can be found by their exact @username, or by email if they allow it.'
              : (emptyHint ??
                'Enter an exact @username or email address to find someone.')}
          </p>
        )}
      </div>
    </div>
  )
}
