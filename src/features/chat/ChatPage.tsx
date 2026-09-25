import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Archive, Bell, Check, CircleDashed, LoaderCircle, MessageCircle, MoreVertical, Phone, Plus, Search, Send, Settings, Users, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { getProfile, repairStoredPublicKey, updateProfileSettings, type Profile } from '../../lib/profile'
import { createDirectChat, createGroupChat, findProfileByUsername, loadChats, loadDecryptedMessage, loadDecryptedMessages, sendEncryptedMessage, subscribeToChat, updateChatSetting, type ChatSummary, type DecryptedMessage, type ProfileSearchResult } from './chatService'
import { createCaptionStatus, loadActiveStatuses, markStatusViewed, type StatusItem } from '../status/statusService'
import { notifyNewMessage } from '../../lib/notifications'
import { useWebRTCCall } from '../calls/useWebRTCCall'
import CallOverlay from '../calls/CallOverlay'

type ChatPageProps = { darkMode: boolean; onToggleTheme: () => void }

function formatTime(value: string): string {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default function ChatPage({ darkMode, onToggleTheme }: ChatPageProps) {
  const { user, signOut, unlockEncryption } = useAuth()
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [selectedChat, setSelectedChat] = useState<ChatSummary | null>(null)
  const [messages, setMessages] = useState<DecryptedMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [profileResult, setProfileResult] = useState<ProfileSearchResult | null>(null)
  const [searchingProfile, setSearchingProfile] = useState(false)
  const [creatingChat, setCreatingChat] = useState(false)
  const [encryptionLocked, setEncryptionLocked] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState('')
  const [chatSearch, setChatSearch] = useState('')
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [statusCaption, setStatusCaption] = useState('')
  const [statuses, setStatuses] = useState<StatusItem[]>([])
  const [statusSaving, setStatusSaving] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const [callVideo, setCallVideo] = useState(false)
  const call = useWebRTCCall(user?.id)

  const userId = user?.id
  const refreshChats = useCallback(async (): Promise<ChatSummary[]> => {
    setError(null)
    try {
      if (!userId) return []
      const nextChats = await loadChats(userId)
      setChats(nextChats)
      setSelectedChat((current) => current && nextChats.some((chat) => chat.id === current.id) ? current : nextChats[0] ?? null)
      return nextChats
    } catch (chatError: unknown) {
      setError(chatError instanceof Error ? chatError.message : 'Unable to load your chats.')
      return []
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Results for a chat the user has already navigated away from must not overwrite the current one.
  const activeChatId = useRef<string | null>(null)

  const refreshMessages = useCallback(async (chatId: string) => {
    if (!user) return
    setMessagesLoading(true)
    try {
      const loaded = await loadDecryptedMessages(chatId, user.id)
      if (activeChatId.current !== chatId) return
      setMessages(loaded)
      setEncryptionLocked(false)
    } catch (messageError: unknown) {
      if (activeChatId.current !== chatId) return
      const message = messageError instanceof Error ? messageError.message : 'Unable to load messages.'
      setEncryptionLocked(message.includes('encryption identity'))
      setError(message)
    } finally {
      if (activeChatId.current === chatId) setMessagesLoading(false)
    }
  }, [user])

  // Fetch and decrypt a single message, then insert, replace or (if now hidden) remove it in place.
  const applyMessage = useCallback(async (chatId: string, messageId: string) => {
    if (!user) return
    try {
      const message = await loadDecryptedMessage(messageId, user.id)
      if (activeChatId.current !== chatId) return
      if (message && !message.isMine) notifyNewMessage('a contact')
      setMessages((current) => {
        const without = current.filter((existing) => existing.id !== messageId)
        if (!message) return without
        return [...without, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      })
    } catch (messageError: unknown) {
      if (activeChatId.current !== chatId) return
      const message = messageError instanceof Error ? messageError.message : 'Unable to load the new message.'
      setEncryptionLocked(message.includes('encryption identity'))
      setError(message)
    }
  }, [user])

  useEffect(() => { void refreshChats() }, [refreshChats])

  useEffect(() => {
    if (userId) void repairStoredPublicKey(userId).catch(() => undefined)
  }, [userId])

  useEffect(() => {
    activeChatId.current = selectedChat?.id ?? null
    if (!selectedChat) {
      setMessages([])
      return
    }
    const chatId = selectedChat.id
    setMessages([])
    void refreshMessages(chatId)
    return subscribeToChat(chatId, (messageId) => void applyMessage(chatId, messageId))
  }, [applyMessage, refreshMessages, selectedChat])

  async function handleSend(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !selectedChat || !user || sending) return
    setSending(true)
    setError(null)
    try {
      const messageId = await sendEncryptedMessage(selectedChat.id, user.id, text)
      setDraft('')
      await applyMessage(selectedChat.id, messageId)
    } catch (sendError: unknown) {
      const message = sendError instanceof Error ? sendError.message : 'Message failed to send.'
      setEncryptionLocked(message.includes('encryption identity'))
      setError(message)
    } finally {
      setSending(false)
    }
  }

  async function handleProfileSearch(event: FormEvent) {
    event.preventDefault()
    if (!user || !username.trim()) return
    setSearchingProfile(true)
    setError(null)
    setProfileResult(null)
    try {
      setProfileResult(await findProfileByUsername(username, user.id))
    } catch (profileError: unknown) {
      setError(profileError instanceof Error ? profileError.message : 'Unable to search for that username.')
    } finally {
      setSearchingProfile(false)
    }
  }

  // State updates are async, so a fast double-click can start two creations before `creatingChat` disables the button.
  const creatingRef = useRef(false)

  async function handleCreateChat() {
    if (!user || !profileResult || creatingRef.current) return
    creatingRef.current = true
    setCreatingChat(true)
    setError(null)
    try {
      const chatId = await createDirectChat(profileResult.id)
      const nextChats = await refreshChats()
      const createdChat = nextChats.find((chat) => chat.id === chatId)
      if (createdChat) setSelectedChat(createdChat)
      setNewChatOpen(false)
      setUsername('')
      setProfileResult(null)
    } catch (chatError: unknown) {
      setError(chatError instanceof Error ? chatError.message : 'Unable to create the chat.')
    } finally {
      creatingRef.current = false
      setCreatingChat(false)
    }
  }

  async function handleCreateGroup(event: FormEvent) {
    event.preventDefault()
    if (!user || !groupName.trim() || !groupMembers.trim() || creatingRef.current) return
    creatingRef.current = true
    setCreatingChat(true)
    setError(null)
    try {
      const usernames = groupMembers.split(',').map((value) => value.trim()).filter(Boolean)
      const profiles = await Promise.all(usernames.map((value) => findProfileByUsername(value, user.id)))
      const memberIds = profiles.flatMap((profile) => profile ? [profile.id] : [])
      if (memberIds.length !== usernames.length) throw new Error('One or more usernames could not be found.')
      const chatId = await createGroupChat(groupName, memberIds)
      const nextChats = await refreshChats()
      const createdChat = nextChats.find((chat) => chat.id === chatId)
      if (createdChat) setSelectedChat(createdChat)
      setGroupOpen(false)
      setGroupName('')
      setGroupMembers('')
    } catch (groupError: unknown) {
      setError(groupError instanceof Error ? groupError.message : 'Unable to create the group.')
    } finally {
      creatingRef.current = false
      setCreatingChat(false)
    }
  }

  async function handleUnlock(event: FormEvent) {
    event.preventDefault()
    if (!unlockPassword) return
    setUnlocking(true)
    const unlocked = await unlockEncryption(unlockPassword)
    setUnlocking(false)
    if (!unlocked) {
      setError('That password could not unlock this device.')
      return
    }
    setUnlockPassword('')
    setUnlockOpen(false)
    setEncryptionLocked(false)
    setError(null)
    if (selectedChat) await refreshMessages(selectedChat.id)
  }

  async function handleChatSetting(setting: 'is_pinned' | 'is_archived' | 'is_muted', value: boolean) {
    if (!selectedChat) return
    try {
      await updateChatSetting(selectedChat.id, setting, value)
      setChatMenuOpen(false)
      await refreshChats()
    } catch (settingError: unknown) {
      setError(settingError instanceof Error ? settingError.message : 'Unable to update chat settings.')
    }
  }

  async function openSettings() {
    if (!user) return
    setSettingsOpen(true)
    try {
      setProfile(await getProfile(user.id))
    } catch (settingsError: unknown) {
      setError(settingsError instanceof Error ? settingsError.message : 'Unable to load settings.')
    }
  }

  async function handleSettingsSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !profile) return
    setSettingsSaving(true)
    try {
      await updateProfileSettings(user.id, { display_name: profile.display_name, about: profile.about ?? '', show_last_seen: profile.show_last_seen, show_read_receipts: profile.show_read_receipts, discoverable_by: profile.discoverable_by })
      setSettingsOpen(false)
    } catch (settingsError: unknown) {
      setError(settingsError instanceof Error ? settingsError.message : 'Unable to save settings.')
    } finally {
      setSettingsSaving(false)
    }
  }

  async function openStatuses() {
    if (!user) return
    setStatusOpen(true)
    try {
      setStatuses(await loadActiveStatuses(user.id))
    } catch (statusError: unknown) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to load statuses.')
    }
  }

  async function handleStatusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !statusCaption.trim()) return
    setStatusSaving(true)
    try {
      await createCaptionStatus(user.id, statusCaption)
      setStatusCaption('')
      setStatuses(await loadActiveStatuses(user.id))
    } catch (statusError: unknown) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to post status.')
    } finally {
      setStatusSaving(false)
    }
  }

  async function startCall(video: boolean) {
    if (!user || !selectedChat || !supabase) return
    const { data, error: callError } = await supabase.from('calls').insert({ chat_id: selectedChat.id, caller_id: user.id, call_type: video ? 'video' : 'voice' }).select('id').single()
    if (callError) {
      setError(callError.message)
      return
    }
    setCallVideo(video)
    setCallOpen(true)
    await call.startCall(data.id, video)
  }

  const visibleChats = chats.filter((chat) => !chat.isArchived && chat.name.toLowerCase().includes(chatSearch.trim().toLowerCase()))

  return (
    <main className={darkMode ? 'app-shell dark' : 'app-shell'}>
      <nav className="app-rail" aria-label="Primary navigation">
        <div className="rail-top">
          <button className="rail-active" aria-label="Chats"><MessageCircle size={22} /></button>
          <button aria-label="Calls" onClick={() => void startCall(false)}><Phone size={21} /></button>
          <button aria-label="Status" onClick={() => void openStatuses()}><CircleDashed size={22} /></button>
          <button aria-label="Communities"><Users size={22} /></button>
        </div>
        <div className="rail-bottom"><button aria-label="Settings" onClick={() => void openSettings()}><Settings size={20} /></button><button className="rail-profile" aria-label="Profile" onClick={() => void openSettings()}>{user?.email?.slice(0, 1).toUpperCase() ?? 'W'}</button></div>
      </nav>
      <aside className="sidebar">
        <header className="sidebar-header"><strong className="whatsapp-wordmark">WhatsApp</strong><div className="header-actions"><button className="new-chat-circle" aria-label="New chat" onClick={() => setNewChatOpen(true)}><Plus size={22} strokeWidth={2.5} /></button><button aria-label="More options"><MoreVertical size={20} /></button><button className="logout-button" aria-label="Log out" onClick={() => void signOut()}>↪</button></div></header>
        <div className="search-box"><Search size={17} /><input aria-label="Search chats" value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search or start a new chat" /></div>
        <nav className="filter-row" aria-label="Chat filters"><button className="filter active">All</button><button className="filter">Unread <b>219</b></button><button className="filter">Favourites</button><button className="filter" onClick={() => setGroupOpen(true)}>Groups <b>86</b></button><button className="filter filter-plus" aria-label="Manage selected chat" onClick={() => setChatMenuOpen(true)}><Plus size={16} /></button></nav>
        <div className="notification-banner"><Bell size={22} /><div><strong>Message and call notifications are off.</strong><button>Turn on</button></div><button aria-label="Dismiss notification">×</button></div>
        <section className="chat-list" aria-label="Chats">
          {loading && <div className="list-state"><LoaderCircle className="spin" size={18} /> Loading chats...</div>}
          {!loading && visibleChats.map((chat) => <button className={selectedChat?.id === chat.id ? 'chat-row selected' : 'chat-row'} key={chat.id} onClick={() => setSelectedChat(chat)}><span className="chat-avatar" style={{ backgroundColor: chat.color }}>{chat.initials}</span><span className="chat-copy"><span className="chat-title"><strong>{chat.name}</strong><time>{chat.time}</time></span><span className="chat-preview">{chat.isMuted ? 'Muted' : chat.preview}</span></span>{chat.isPinned && <span className="pin-mark">•</span>}</button>)}
          {!loading && visibleChats.length === 0 && <div className="list-empty"><MessageCircle size={22} /><strong>{chatSearch ? 'No matching chats' : 'No chats yet'}</strong><span>{chatSearch ? 'Try another search.' : 'Start a conversation with the green plus button.'}</span></div>}
          <button className="archived-row" onClick={() => setChatSearch('')}><Archive size={18} /><span>Archived</span></button>
        </section>
      </aside>
      {selectedChat && chatMenuOpen && <div className="chat-menu-panel"><strong>{selectedChat.name}</strong><button onClick={() => void handleChatSetting('is_pinned', !selectedChat.isPinned)}>{selectedChat.isPinned ? 'Unpin chat' : 'Pin chat'}</button><button onClick={() => void handleChatSetting('is_muted', !selectedChat.isMuted)}>{selectedChat.isMuted ? 'Unmute chat' : 'Mute chat'}</button><button onClick={() => void handleChatSetting('is_archived', true)}>Archive chat</button><button onClick={() => setChatMenuOpen(false)}>Close</button></div>}
      <section className="conversation">
        {selectedChat ? <><header className="conversation-header"><span className="chat-avatar small" style={{ backgroundColor: selectedChat.color }}>{selectedChat.initials}</span><div><strong>{selectedChat.name}</strong><span>{selectedChat.isGroup ? 'Group chat' : 'online'}</span></div><button aria-label="Start video call" onClick={() => void startCall(true)}>▣</button><button aria-label="Search conversation"><Search size={20} /></button><button aria-label="More conversation options"><MoreVertical size={20} /></button></header><div className="message-area"><div className="encryption-note"><span>🔒</span> Messages are end-to-end encrypted. No one outside of this chat can read them.</div>{messagesLoading && <div className="message-state"><LoaderCircle className="spin" size={18} /> Decrypting messages...</div>}{!messagesLoading && messages.length === 0 && <div className="message-state">No messages yet. Send the first one.</div>}{messages.map((message) => <div className={message.isMine ? 'message-bubble sent' : 'message-bubble received'} key={message.id}><span>{message.text}</span><time>{formatTime(message.createdAt)} {message.isMine && '✓'}</time></div>)}</div><form className="composer" onSubmit={handleSend}><button type="button" aria-label="Attach file">+</button><button type="button" aria-label="Emoji">☺</button><input aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a message" disabled={sending} /><button type="submit" aria-label="Send message" className="send-button" disabled={!draft.trim() || sending}>{sending ? <LoaderCircle className="spin" size={20} /> : <Send size={20} />}</button></form></> : <div className="empty-conversation"><div className="empty-icon"><MessageCircle size={42} /></div><h1>WhatsApp for web</h1><p>Send and receive encrypted messages in realtime.</p><small>{loading ? 'Loading your chats...' : 'Choose a chat to get started'}</small><button className="theme-toggle" onClick={onToggleTheme}>Switch to {darkMode ? 'light' : 'dark'} theme</button>{!isSupabaseConfigured && <div className="setup-notice">Add your Supabase values to <strong>.env</strong> before connecting your account.</div>}{error && <div className="setup-notice">{error}</div>}</div>}
        {error && selectedChat && <div className="connection-banner" role="alert"><span>{error}</span>{encryptionLocked && <button onClick={() => setUnlockOpen(true)}>Unlock</button>}</div>}
      </section>
      {newChatOpen && <div className="modal-backdrop" role="presentation" onClick={() => setNewChatOpen(false)}><section className="new-chat-modal" role="dialog" aria-modal="true" aria-labelledby="new-chat-title" onClick={(event) => event.stopPropagation()}><header><div><h2 id="new-chat-title">New chat</h2><span>Find someone by their username</span></div><button aria-label="Close new chat" onClick={() => setNewChatOpen(false)}><X size={20} /></button></header><form onSubmit={handleProfileSearch} className="new-chat-form"><div className="username-input"><span>@</span><input autoFocus value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ''))} placeholder="username" /></div><button type="submit" className="next-button" disabled={searchingProfile || !username.trim()}>{searchingProfile ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />} Search</button></form>{profileResult && <div className="profile-result"><span className="chat-avatar">{profileResult.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{profileResult.displayName}</strong><span>@{profileResult.username}</span></div><button aria-label="Start chat" onClick={() => void handleCreateChat()} disabled={creatingChat}>{creatingChat ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}</button></div>}{!searchingProfile && username && !profileResult && <p className="modal-hint">No matching profile found.</p>}</section></div>}
      {groupOpen && <div className="modal-backdrop" role="presentation" onClick={() => setGroupOpen(false)}><section className="new-chat-modal group-modal" role="dialog" aria-modal="true" aria-labelledby="group-title" onClick={(event) => event.stopPropagation()}><header><div><h2 id="group-title">New group</h2><span>Add people by username</span></div><button aria-label="Close new group" onClick={() => setGroupOpen(false)}><X size={20} /></button></header><form className="group-form" onSubmit={handleCreateGroup}><input aria-label="Group name" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" maxLength={100} required /><input aria-label="Group members" value={groupMembers} onChange={(event) => setGroupMembers(event.target.value)} placeholder="user_one, user_two" required /><button className="next-button" type="submit" disabled={creatingChat}>{creatingChat ? 'Creating...' : 'Create group'}</button></form></section></div>}
      {unlockOpen && <div className="modal-backdrop" role="presentation" onClick={() => setUnlockOpen(false)}><section className="new-chat-modal unlock-modal" role="dialog" aria-modal="true" aria-labelledby="unlock-title" onClick={(event) => event.stopPropagation()}><header><div><h2 id="unlock-title">Unlock encryption</h2><span>Enter your account password to unlock this device. It is never stored.</span></div><button aria-label="Close unlock dialog" onClick={() => setUnlockOpen(false)}><X size={20} /></button></header><form className="group-form" onSubmit={handleUnlock}><input aria-label="Account password" type="password" autoComplete="current-password" value={unlockPassword} onChange={(event) => setUnlockPassword(event.target.value)} placeholder="Account password" required /><button className="next-button" type="submit" disabled={unlocking}>{unlocking ? 'Unlocking...' : 'Unlock'}</button></form></section></div>}
      {settingsOpen && <div className="modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}><section className="new-chat-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}><header><div><h2 id="settings-title">Settings</h2><span>Profile and privacy</span></div><button aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={20} /></button></header>{profile ? <form className="group-form settings-form" onSubmit={handleSettingsSave}><label>Display name<input value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} required /></label><label>About<input value={profile.about ?? ''} onChange={(event) => setProfile({ ...profile, about: event.target.value })} maxLength={140} /></label><label className="setting-toggle"><input type="checkbox" checked={profile.show_last_seen} onChange={(event) => setProfile({ ...profile, show_last_seen: event.target.checked })} /> Show last seen</label><label className="setting-toggle"><input type="checkbox" checked={profile.show_read_receipts} onChange={(event) => setProfile({ ...profile, show_read_receipts: event.target.checked })} /> Show read receipts</label><label>Discoverable by<select value={profile.discoverable_by} onChange={(event) => setProfile({ ...profile, discoverable_by: event.target.value as Profile['discoverable_by'] })}><option value="username">Username</option><option value="username_and_email">Username and email</option><option value="nobody">Nobody</option></select></label><button className="next-button" type="submit" disabled={settingsSaving}>{settingsSaving ? 'Saving...' : 'Save settings'}</button></form> : <div className="list-state"><LoaderCircle className="spin" size={18} /> Loading settings...</div>}</section></div>}
      {statusOpen && <div className="modal-backdrop" role="presentation" onClick={() => setStatusOpen(false)}><section className="new-chat-modal status-modal" role="dialog" aria-modal="true" aria-labelledby="status-title" onClick={(event) => event.stopPropagation()}><header><div><h2 id="status-title">Status</h2><span>Share an update that disappears after 24 hours.</span></div><button aria-label="Close status" onClick={() => setStatusOpen(false)}><X size={20} /></button></header><form className="group-form" onSubmit={handleStatusSubmit}><textarea aria-label="Status update" value={statusCaption} onChange={(event) => setStatusCaption(event.target.value)} placeholder="What's on your mind?" maxLength={700} required /><button className="next-button" type="submit" disabled={statusSaving}>{statusSaving ? 'Posting...' : 'Post status'}</button></form><div className="status-list">{statuses.length === 0 && <p className="modal-hint">No active statuses yet.</p>}{statuses.map((status) => <button className="status-item" key={status.id} onClick={() => user && void markStatusViewed(status.id, user.id)}><span className="status-ring">{status.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{status.isMine ? 'Your status' : status.displayName}</strong><small>{status.caption}</small></span></button>)}</div></section></div>}
      {callOpen && <CallOverlay call={call} video={callVideo} onClose={() => setCallOpen(false)} />}
    </main>
  )
}
