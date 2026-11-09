import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const socket = io('http://localhost:3000')

function App() {
  const [inputmessage, setInputMessage] = useState('')
  const [messages, setMessages] = useState([])

  useEffect(() => {
    const handleMessage = (message) => {
      setMessages((currentMessages) => [...currentMessages, message])
    }

    socket.on('message', handleMessage)

    return () => {
      socket.off('message', handleMessage)
    }
  }, [])

  const sendMessage = (event) => {
    event.preventDefault()

    if (!inputmessage.trim()) {
      return
    }

    socket.emit('message', inputmessage)
    setInputMessage('')
  }

  return (
    <>
      <form onSubmit={sendMessage}>
        <input
          type="text"
          value={inputmessage}
          onChange={(event) => setInputMessage(event.target.value)}
          placeholder="Type a message"
          aria-label="Message"
        />
        <button type="submit">Send</button>
      </form>
      <ul>
        {messages.map((message, index) => (
          <li key={`${message}-${index}`}>{message}</li>
        ))}
      </ul>
    </>
  )
}

export default App
