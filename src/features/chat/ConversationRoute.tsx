import { useParams } from 'react-router-dom'
import { Conversation } from './components/Conversation'

export default function ConversationRoute() {
  const { chatId } = useParams()
  return chatId ? <Conversation key={chatId} chatId={chatId} /> : null
}
