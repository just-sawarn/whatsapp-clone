import { useState } from 'react'
import { Outlet, useMatch } from 'react-router-dom'
import { SplitLayout } from '../../components/layout/SplitLayout'
import { ChatList } from './components/ChatList'
import { NewChatModal } from './components/NewChatModal'

/** The chats area: a persistent list beside whichever conversation (or welcome pane) the route selects. */
export default function ChatsLayout() {
  const chatId = useMatch('/chat/:chatId')?.params.chatId
  const [modal, setModal] = useState<'chat' | 'group' | null>(null)
  return (
    <>
      <SplitLayout
        list={
          <ChatList
            selectedChatId={chatId}
            onNewChat={() => setModal('chat')}
            onNewGroup={() => setModal('group')}
          />
        }
        detail={<Outlet />}
        hasDetail={chatId !== undefined}
      />
      <NewChatModal
        mode={modal}
        onClose={() => setModal(null)}
        onSwitch={setModal}
      />
    </>
  )
}
