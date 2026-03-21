'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'

const AGENT_COLORS: Record<string, string> = {
  researcher: 'text-blue-400',
  coder: 'text-green-400',
  analyst: 'text-yellow-400',
  writer: 'text-purple-400',
  planner: 'text-orange-400',
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  agentName?: string
  agentId?: string
  feedback?: 1 | -1 | null
}

interface ChatInterfaceProps {
  plan: 'free' | 'pro'
  initialConversationId?: string
}

export default function ChatInterface({ plan, initialConversationId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState(initialConversationId)
  const [remaining, setRemaining] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const assistantId = `${Date.now()}-ai`
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', feedback: null }])
    setActiveAgent(null)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, conversationId }),
      })

      if (res.status === 429) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: 'Rate limit reached. Upgrade to Pro for more messages.' }
            : m
        ))
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let realMessageId = assistantId

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          const data = JSON.parse(line.slice(6))

          if (data.type === 'meta') {
            if (!conversationId) setConversationId(data.conversationId)
            setRemaining(data.remaining)
            if (data.agent) {
              setActiveAgent(data.agent.name)
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, agentName: data.agent.name, agentId: data.agent.id }
                  : m
              ))
            }
          }

          if (data.type === 'delta') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content + data.text } : m
            ))
          }

          if (data.type === 'done') {
            realMessageId = data.messageId
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, id: realMessageId } : m
            ))
            // Emit cost event so CostMeter updates live
            window.dispatchEvent(new CustomEvent('agentkit:cost', {
              detail: { costUsd: data.costUsd, conversationId }
            }))
            // Emit trace event so TraceViewer knows to refresh
            window.dispatchEvent(new CustomEvent('agentkit:trace', {
              detail: { conversationId }
            }))
          }
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function submitFeedback(messageId: string, feedback: 1 | -1) {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, feedback } : m))
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, feedback }),
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-medium">Chat</span>
        <div className="flex items-center gap-2">
          <Badge className={plan === 'pro' ? 'bg-white text-black' : 'bg-white/10 text-white border-white/20'}>
            {plan === 'pro' ? 'Pro' : 'Free'}
          </Badge>
          {remaining !== null && (
            <span className="text-xs text-zinc-500">{remaining} msgs left today</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">
            Start a conversation
          </div>
        )}
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`group max-w-[80%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                {msg.role === 'assistant' && msg.agentName && (
                  <div className={`text-xs font-medium mb-1 ${AGENT_COLORS[msg.agentId ?? ''] ?? 'text-zinc-400'}`}>
                    {msg.agentName} Agent
                  </div>
                )}
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-white text-black rounded-br-sm'
                    : 'bg-white/10 text-white rounded-bl-sm'
                }`}>
                  {msg.content || (loading && msg.role === 'assistant' ? (
                    <span className="animate-pulse text-zinc-500">
                      {activeAgent ? `${activeAgent} Agent thinking…` : 'Routing…'}
                    </span>
                  ) : '')}
                </div>

                {/* RLHF feedback buttons */}
                {msg.role === 'assistant' && msg.content && (
                  <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => submitFeedback(msg.id, 1)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        msg.feedback === 1 ? 'text-green-400' : 'text-zinc-600 hover:text-green-400'
                      }`}
                    >
                      👍
                    </button>
                    <button
                      onClick={() => submitFeedback(msg.id, -1)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        msg.feedback === -1 ? 'text-red-400' : 'text-zinc-600 hover:text-red-400'
                      }`}
                    >
                      👎
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Message… (Enter to send, Shift+Enter for newline)"
            className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600 resize-none min-h-[44px] max-h-32"
            rows={1}
            disabled={loading}
          />
          <Button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="bg-white text-black hover:bg-zinc-200 shrink-0"
          >
            Send
          </Button>
        </div>
        {plan === 'free' && (
          <p className="text-center text-xs text-zinc-600 mt-2">
            Free plan: 10 messages/day · 10-message memory ·{' '}
            <a href="/api/upgrade" className="text-zinc-400 hover:text-white underline">Upgrade to Pro</a>
          </p>
        )}
      </div>
    </div>
  )
}
