import { useState } from 'react'
import ChatPage from './features/chat/ChatPage'

function App() {
  const [darkMode, setDarkMode] = useState(false)
  return <ChatPage darkMode={darkMode} onToggleTheme={() => setDarkMode((current) => !current)} />
}

export default App
