import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  ArrowLeft,
  BellOff,
  MessageCircle,
  MessageSquarePlus,
  Search,
  Star,
  UserPlus,
  X,
} from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { ChatListSkeleton } from '../../../components/ui/Skeleton'
import {
  ContextMenu,
  DropdownMenu,
  type MenuItem,
} from '../../../components/ui/Menu'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Icon } from '../../../components/ui/Icon'
import { IconButton } from '../../../components/ui/IconButton'
import { cn } from '../../../lib/cn'
import { errorMessage } from '../../../lib/errors'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import { useAuth } from '../../auth/AuthContext'
import { useRealtime } from '../../realtime/RealtimeContext'
import { useChatActions } from '../useChatActions'
import { useChatOverview } from '../useChats'
import type { ChatSummary } from '../types'
import { ChatListItem } from './ChatListItem'
import { MessageSearchResults } from './MessageSearchResults'

type Filter = 'all' | 'unread' | 'groups'
type Props = {
  selectedChatId: string | undefined
  onNewChat: () => void
  onNewGroup: () => void
}

const isUnread = (chat: ChatSummary) =>
  chat.unreadCount > 0 || chat.markedUnread

export function ChatList({ selectedChatId, onNewChat, onNewGroup }: Props) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { data: chats = [], isPending, error, refetch } = useChatOverview()
  const { onlineUserIds } = useRealtime()
  const actions = useChatActions()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    chat: ChatSummary
  } | null>(null)
  const term = useDebouncedValue(search.trim().toLowerCase(), 250)

  const archived = useMemo(
    () => chats.filter((chat) => chat.isArchived),
    [chats],
  )
  const visible = useMemo(() => {
    const pool = showArchived
      ? archived
      : chats.filter((chat) => !chat.isArchived)
    return pool
      .filter((chat) =>
        filter === 'unread'
          ? isUnread(chat)
          : filter === 'groups'
            ? chat.isGroup
            : true,
      )
      .filter(
        (chat) =>
          term === '' ||
          chat.name.toLowerCase().includes(term) ||
          (chat.peerUsername ?? '').includes(term.replace(/^@/, '')),
      )
  }, [archived, chats, filter, showArchived, term])

  const menuItems = (chat: ChatSummary): MenuItem[] => [
    {
      label: chat.isPinned ? 'Unpin chat' : 'Pin chat',
      onSelect: () => void actions.togglePin(chat),
    },
    {
      label: chat.isArchived ? 'Unarchive chat' : 'Archive chat',
      onSelect: () => void actions.toggleArchive(chat),
    },
    chat.isMuted
      ? {
          label: 'Unmute notifications',
          onSelect: () => void actions.mute(chat, null),
        }
      : {
          label: 'Mute for 8 hours',
          onSelect: () => void actions.mute(chat, '8h'),
        },
    ...(chat.isMuted
      ? []
      : [
          {
            label: 'Mute for 1 week',
            onSelect: () => void actions.mute(chat, '1w'),
          },
          {
            label: 'Mute always',
            onSelect: () => void actions.mute(chat, 'always'),
          },
        ]),
    {
      label: 'Mark as unread',
      onSelect: () => void actions.markUnread(chat),
      disabled: isUnread(chat),
    },
    {
      label: chat.isGroup ? 'Exit group' : 'Delete chat',
      onSelect: () => void actions.deleteChat(chat),
      danger: true,
      separatorBefore: true,
    },
  ]

  const filters: Array<{ id: Filter; label: string; count?: number }> = [
    { id: 'all', label: 'All' },
    {
      id: 'unread',
      label: 'Unread',
      count: chats.filter((chat) => !chat.isArchived && isUnread(chat)).length,
    },
    { id: 'groups', label: 'Groups' },
  ]

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center justify-between bg-panel px-4">
        {showArchived ? (
          <div className="flex items-center gap-2">
            <IconButton
              icon={ArrowLeft}
              label="Back to chats"
              onClick={() => setShowArchived(false)}
            />
            <h1 className="text-xl font-medium">Archived</h1>
          </div>
        ) : (
          <h1 className="text-[22px] font-semibold">ChatBit</h1>
        )}
        <div className="flex items-center gap-1">
          <IconButton
            icon={MessageSquarePlus}
            label="New chat"
            onClick={onNewChat}
          />
          <DropdownMenu
            items={[
              { label: 'New group', icon: UserPlus, onSelect: onNewGroup },
              {
                label: 'Starred messages',
                icon: Star,
                onSelect: () => navigate('/settings/starred'),
              },
              { label: 'Settings', onSelect: () => navigate('/settings') },
              {
                label: 'Log out',
                onSelect: () => void signOut(),
                separatorBefore: true,
              },
            ]}
          />
        </div>
      </header>

      <div className="px-3 pb-2 pt-2">
        <label className="flex h-9 items-center gap-3 rounded-lg bg-panel px-3 text-muted focus-within:ring-2 focus-within:ring-primary/30">
          <Icon icon={Search} size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search or start a new chat"
            aria-label="Search chats and messages"
            className="w-full bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
            >
              <Icon icon={X} size={16} />
            </button>
          )}
        </label>
        <div
          className="mt-2 flex gap-2"
          role="tablist"
          aria-label="Chat filters"
        >
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors',
                filter === item.id
                  ? 'bg-primary/15 text-link'
                  : 'bg-panel text-muted hover:bg-surface-hover',
              )}
            >
              {item.label}
              {item.count ? (
                <span className="ml-1.5 text-xs">{item.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!showArchived && archived.length > 0 && term === '' && (
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="flex w-full items-center gap-4 px-5 py-3 text-left text-[15px] hover:bg-surface-hover"
          >
            <Icon icon={Archive} size={20} className="text-link" />
            <span className="flex-1">Archived</span>
            <span className="text-xs text-link">{archived.length}</span>
          </button>
        )}
        {isPending ? (
          <ChatListSkeleton />
        ) : error ? (
          <EmptyState
            icon={BellOff}
            title="Could not load your chats"
            description={errorMessage(error)}
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        ) : visible.length === 0 ? (
          term ? (
            <p className="px-6 py-8 text-center text-sm text-muted">
              No chats match “{search.trim()}”.
            </p>
          ) : (
            <EmptyState
              icon={MessageCircle}
              title={
                showArchived
                  ? 'No archived chats'
                  : filter === 'unread'
                    ? 'No unread chats'
                    : filter === 'groups'
                      ? 'No groups yet'
                      : 'No chats yet'
              }
              description={
                showArchived
                  ? 'Chats you archive appear here.'
                  : 'Start a conversation with someone by their @username.'
              }
              action={
                !showArchived && filter === 'all' ? (
                  <Button icon={MessageSquarePlus} onClick={onNewChat}>
                    Start a new chat
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          visible.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              selected={chat.id === selectedChatId}
              online={chat.peerId !== null && onlineUserIds.has(chat.peerId)}
              typing={false}
              onSelect={() => navigate(`/chat/${chat.id}`)}
              onContextMenu={(x, y) => setMenu({ x, y, chat })}
            />
          ))
        )}
        {term.length >= 2 && (
          <MessageSearchResults
            term={term}
            chats={chats}
            onOpen={(chatId, messageId) =>
              navigate(`/chat/${chatId}?m=${messageId}`)
            }
          />
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.chat)}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
