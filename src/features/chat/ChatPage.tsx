import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Archive, Bell, Check, CircleDashed, LoaderCircle, MessageCircle, MoreVertical, Phone, Search, Send, Settings, Users, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'
import { createDirectChat, findProfileByUsername, loadChats, loadDecryptedMessages, sendEncryptedMessage, subscribeToChat, type ChatSummary, type DecryptedMessage, type ProfileSearchResult } from './chatService'

type ChatPageProps = { darkMode: boolean; onToggleTheme: () => void }

function formatTime(value: string): string {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default function ChatPage({ darkMode, onToggleTheme }: ChatPageProps) {
  const { user, signOut } = useAuth()
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

  async function refreshChats(): Promise<ChatSummary[]> {
    setError(null)
    try {
      const nextChats = await loadChats()
      setChats(nextChats)
      setSelectedChat((current) => current && nextChats.some((chat) => chat.id === current.id) ? current : nextChats[0] ?? null)
      return nextChats
    } catch (chatError: unknown) {
      setError(chatError instanceof Error ? chatError.message : 'Unable to load your chats.')
      return []
    } finally {
      setLoading(false)
    }
  }

  const refreshMessages = useCallback(async (chatId: string) => {
    if (!user) return
    setMessagesLoading(true)
    try {
      setMessages(await loadDecryptedMessages(chatId, user.id))
    } catch (messageError: unknown) {
      setError(messageError instanceof Error ? messageError.message : 'Unable to load messages.')
    } finally {
      setMessagesLoading(false)
    }
  }, [user])

  useEffect(() => { void refreshChats() }, [])

  useEffect(() => {
    if (!selectedChat) {
      setMessages([])
      return
    }
    void refreshMessages(selectedChat.id)
    return subscribeToChat(selectedChat.id, () => void refreshMessages(selectedChat.id))
  }, [refreshMessages, selectedChat])

  async function handleSend(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !selectedChat || !user || sending) return
    setSending(true)
    setError(null)
    try {
      await sendEncryptedMessage(selectedChat.id, user.id, text)
      setDraft('')
      await refreshMessages(selectedChat.id)
    } catch (sendError: unknown) {
      setError(sendError instanceof Error ? sendError.message : 'Message failed to send.')
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

  async function handleCreateChat() {
    if (!user || !profileResult) return
    setCreatingChat(true)
    setError(null)
    try {
      const chatId = await createDirectChat(user.id, profileResult.id)
      const nextChats = await refreshChats()
      const createdChat = nextChats.find((chat) => chat.id === chatId)
      if (createdChat) setSelectedChat(createdChat)
      setNewChatOpen(false)
      setUsername('')
      setProfileResult(null)
    } catch (chatError: unknown) {
      setError(chatError instanceof Error ? chatError.message : 'Unable to create the chat.')
    } finally {
      setCreatingChat(false)
    }
  }

  return (
    <main className={darkMode ? 'app-shell dark' : 'app-shell'}>
      <nav className="app-rail" aria-label="Primary navigation">
        <div className="rail-top">
          <button className="rail-active" aria-label="Chats"><MessageCircle size={22} /></button>
          <button aria-label="Calls"><Phone size={21} /></button>
          <button aria-label="Status"><CircleDashed size={22} /></button>
          <button aria-label="Communities"><Users size={22} /></button>
        </div>
        <div className="rail-bottom"><button aria-label="Settings"><Settings size={20} /></button><button className="rail-profile" aria-label="Profile">{user?.email?.slice(0, 1).toUpperCase() ?? 'W'}</button></div>
      </nav>
      <aside className="sidebar">
        <header className="sidebar-header"><strong className="whatsapp-wordmark">WhatsApp</strong><div className="header-actions"><button className="new-chat-circle" aria-label="New chat" onClick={() => setNewChatOpen(true)}>+</button><button aria-label="More options"><MoreVertical size={20} /></button><button className="logout-button" aria-label="Log out" onClick={() => void signOut()}>↪</button></div></header>
        <div className="search-box"><Search size={17} /><input aria-label="Search chats" placeholder="Search or start a new chat" /></div>
        <nav className="filter-row" aria-label="Chat filters"><button className="filter active">All</button><button className="filter">Unread <b>219</b></button><button className="filter">Favourites</button><button className="filter">Groups <b>86</b></button><button className="filter filter-plus" aria-label="Add filter">+</button></nav>
        <div className="notification-banner"><Bell size={22} /><div><strong>Message and call notifications are off.</strong><button>Turn on</button></div><button aria-label="Dismiss notification">×</button></div>
        <section className="chat-list" aria-label="Chats">
          {loading && <div className="list-state"><LoaderCircle className="spin" size={18} /> Loading chats...</div>}
          {!loading && chats.map((chat) => <button className={selectedChat?.id === chat.id ? 'chat-row selected' : 'chat-row'} key={chat.id} onClick={() => setSelectedChat(chat)}><span className="chat-avatar" style={{ backgroundColor: chat.color }}>{chat.initials}</span><span className="chat-copy"><span className="chat-title"><strong>{chat.name}</strong><time>{chat.time}</time></span><span className="chat-preview">{chat.preview}</span></span></button>)}
          {!loading && chats.length === 0 && <div className="list-empty"><MessageCircle size={22} /><strong>No chats yet</strong><span>Start a conversation with the green plus button.</span></div>}
          <div className="archived-row"><Archive size={18} /><span>Archived</span></div>
        </section>
      </aside>
      <section className="conversation">
        {selectedChat ? <><header className="conversation-header"><span className="chat-avatar small" style={{ backgroundColor: selectedChat.color }}>{selectedChat.initials}</span><div><strong>{selectedChat.name}</strong><span>{selectedChat.isGroup ? 'Group chat' : 'online'}</span></div><button aria-label="Start video call">▣</button><button aria-label="Search conversation"><Search size={20} /></button><button aria-label="More conversation options"><MoreVertical size={20} /></button></header><div className="message-area"><div className="encryption-note"><span>🔒</span> Messages are end-to-end encrypted. No one outside of this chat can read them.</div>{messagesLoading && <div className="message-state"><LoaderCircle className="spin" size={18} /> Decrypting messages...</div>}{!messagesLoading && messages.length === 0 && <div className="message-state">No messages yet. Send the first one.</div>}{messages.map((message) => <div className={message.isMine ? 'message-bubble sent' : 'message-bubble received'} key={message.id}><span>{message.text}</span><time>{formatTime(message.createdAt)} {message.isMine && '✓'}</time></div>)}</div><form className="composer" onSubmit={handleSend}><button type="button" aria-label="Attach file">+</button><button type="button" aria-label="Emoji">☺</button><input aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a message" disabled={sending} /><button type="submit" aria-label="Send message" className="send-button" disabled={!draft.trim() || sending}>{sending ? <LoaderCircle className="spin" size={20} /> : <Send size={20} />}</button></form></> : <div className="empty-conversation"><div className="empty-icon"><MessageCircle size={42} /></div><h1>WhatsApp for web</h1><p>Send and receive encrypted messages in realtime.</p><small>{loading ? 'Loading your chats...' : 'Choose a chat to get started'}</small><button className="theme-toggle" onClick={onToggleTheme}>Switch to {darkMode ? 'light' : 'dark'} theme</button>{!isSupabaseConfigured && <div className="setup-notice">Add your Supabase values to <strong>.env</strong> before connecting your account.</div>}{error && <div className="setup-notice">{error}</div>}</div>}
        {error && selectedChat && <div className="connection-banner" role="alert">{error}</div>}
      </section>
      {newChatOpen && <div className="modal-backdrop" role="presentation" onClick={() => setNewChatOpen(false)}><section className="new-chat-modal" role="dialog" aria-modal="true" aria-labelledby="new-chat-title" onClick={(event) => event.stopPropagation()}><header><div><h2 id="new-chat-title">New chat</h2><span>Find someone by their username</span></div><button aria-label="Close new chat" onClick={() => setNewChatOpen(false)}><X size={20} /></button></header><form onSubmit={handleProfileSearch} className="new-chat-form"><div className="username-input"><span>@</span><input autoFocus value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ''))} placeholder="username" /></div><button type="submit" className="next-button" disabled={searchingProfile || !username.trim()}>{searchingProfile ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />} Search</button></form>{profileResult && <div className="profile-result"><span className="chat-avatar">{profileResult.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{profileResult.displayName}</strong><span>@{profileResult.username}</span></div><button aria-label="Start chat" onClick={() => void handleCreateChat()} disabled={creatingChat}>{creatingChat ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}</button></div>}{!searchingProfile && username && !profileResult && <p className="modal-hint">No matching profile found.</p>}</section></div>}
    </main>
  )
}
